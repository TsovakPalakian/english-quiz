"""Pack or restore only the production builder's non-repository inputs."""
import hashlib
import argparse
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
LIMIT = 512 * 1024 * 1024
MEDIA = "private/private-migration-media"
WORDNET = "private/wordnet-3.0"
WORDNET_FILES = ("manifest.json", "wordnet.sqlite", "LICENSE")
R2_ACCOUNT = "42a9ebe47d529e3664b914aaf0813a21"
R2_BUCKET = "learn-english-ci-inputs"


def build_input_url(expected):
    if not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("configure archive SHA256")
    key = os.environ.get("CI_R2_ACCESS_KEY_ID", "").strip()
    secret = os.environ.get("CI_R2_SECRET_ACCESS_KEY", "").strip()
    if key or secret:
        if not key or not secret or any(c.isspace() for c in key + secret):
            raise ValueError("configure both R2 read-only credentials")
        # Sign in memory for this job; never persist or log the URL or keys.
        import boto3
        from botocore.config import Config

        client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT}.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id=key,
            aws_secret_access_key=secret,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        try:
            return client.generate_presigned_url(
                "get_object",
                Params={"Bucket": R2_BUCKET, "Key": f"ci-build-inputs/{expected}.tar.gz"},
                ExpiresIn=900,
                HttpMethod="GET",
            )
        finally:
            client.close()
    return os.environ.get("CI_BUILD_INPUTS_URL", "")


def allowed(name, directory=False):
    parts = PurePosixPath(name).parts
    if name.startswith("/") or ".." in parts or "\\" in name:
        return False
    if directory:
        return name.rstrip("/") in ("private", MEDIA, WORDNET)
    return name == "wrangler.toml" or name in {WORDNET + "/" + item for item in WORDNET_FILES} or bool(re.fullmatch(MEDIA + r"/[a-f0-9]{64}\.bin", name))


def pack(source_root=None, destination=None, include_wordnet=False):
    root = Path(source_root or ROOT).resolve()
    directory = root / MEDIA
    media = sorted(directory.glob("*.bin"))
    files = [root / "wrangler.toml", *media]
    if not directory.is_dir() or directory.is_symlink() or not files[0].is_file() or len(media) > 32:
        raise ValueError("missing or invalid build inputs")
    if include_wordnet:
        wordnet = root / WORDNET
        if not wordnet.is_dir() or wordnet.is_symlink():
            raise ValueError("missing private WordNet directory")
        files.extend(wordnet / name for name in WORDNET_FILES)
    if sum(path.stat().st_size for path in files) > LIMIT:
        raise ValueError("build inputs exceed size limit")
    for path in files:
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(root) or not allowed(path.relative_to(root).as_posix()):
            raise ValueError("invalid build input")
        if path.suffix == ".bin" and hashlib.sha256(path.read_bytes()).hexdigest() != path.stem:
            raise ValueError("media checksum mismatch")
    destination = Path(destination) if destination else root / ".local-secrets/ci-build-inputs.tar.gz"
    destination.parent.mkdir(mode=0o700, exist_ok=True)
    with destination.open("xb") as output:
        os.chmod(destination, 0o600)
        with tarfile.open(fileobj=output, mode="w:gz") as archive:
            for path in files:
                archive.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
    print(destination)
    print("SHA256=" + hashlib.sha256(destination.read_bytes()).hexdigest())
    print("Private archive created locally; no upload was performed.")


class HttpsRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme != "https":
            raise ValueError("non-HTTPS redirect rejected")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def restore():
    root = ROOT.resolve()
    expected = os.environ.get("CI_BUILD_INPUTS_SHA256", "").lower()
    url = build_input_url(expected)
    if urllib.parse.urlsplit(url).scheme != "https" or not re.fullmatch(r"[a-f0-9]{64}", expected):
        raise ValueError("configure HTTPS input URL and SHA256")
    opener = urllib.request.build_opener(HttpsRedirect())
    with tempfile.TemporaryFile() as output:
        digest = hashlib.sha256()
        total = 0
        with opener.open(url, timeout=60) as response:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > LIMIT:
                    raise ValueError("archive exceeds size limit")
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != expected:
            raise ValueError("archive checksum mismatch")
        output.seek(0)
        with tarfile.open(fileobj=output, mode="r:gz") as archive:
            entries = []
            names = set()
            total = 0
            for member in archive:
                if len(names) >= 64 or member.name in names:
                    raise ValueError("too many or duplicate archive entries")
                names.add(member.name)
                if not (member.isfile() or member.isdir()) or not allowed(member.name, member.isdir()):
                    raise ValueError("unsafe archive entry")
                total += member.size
                if member.size < 0 or total > LIMIT:
                    raise ValueError("expanded archive exceeds size limit")
                entries.append(member)
            if "wrangler.toml" not in names:
                raise ValueError("production configuration missing")
            wordnet_files = {WORDNET + "/" + name for name in WORDNET_FILES}
            if names & wordnet_files and not wordnet_files <= names:
                raise ValueError("incomplete WordNet archive")
            for member in entries:
                if member.isdir():
                    continue
                target = root / member.name
                if not target.resolve().is_relative_to(root) or target.is_symlink():
                    raise ValueError("unsafe destination")
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with archive.extractfile(member) as source, target.open("xb") as destination:
                    os.chmod(target, 0o600)
                    while chunk := source.read(1024 * 1024):
                        destination.write(chunk)
        (root / MEDIA).mkdir(parents=True, exist_ok=True, mode=0o700)
    print("Restored verified build inputs; URL and file contents were not logged.")


if __name__ == "__main__":
    try:
        if sys.argv[1:2] == ["pack"]:
            parser = argparse.ArgumentParser(description="Pack approved private CI inputs without overwriting output.")
            parser.add_argument("--source-root", type=Path)
            parser.add_argument("--output", type=Path)
            parser.add_argument("--include-wordnet", action="store_true")
            args = parser.parse_args(sys.argv[2:])
            pack(args.source_root, args.output, args.include_wordnet)
        elif sys.argv[1:] == ["restore"]:
            restore()
        else:
            raise ValueError("usage: ci-build-inputs.py pack|restore")
    except Exception as error:
        # Exceptions from HTTP libraries can contain signed URLs; never print them.
        print("Build input operation failed (" + type(error).__name__ + "). Check inputs, permissions and configuration.", file=sys.stderr)
        sys.exit(1)
