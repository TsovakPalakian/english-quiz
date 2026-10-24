"""Pack or restore only the production builder's non-repository inputs."""
import hashlib
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


def allowed(name, directory=False):
    parts = PurePosixPath(name).parts
    if name.startswith("/") or ".." in parts or "\\" in name:
        return False
    if directory:
        return name.rstrip("/") in ("private", MEDIA)
    return name == "wrangler.toml" or bool(re.fullmatch(MEDIA + r"/[a-f0-9]{64}\.bin", name))


def pack():
    directory = ROOT / MEDIA
    files = [ROOT / "wrangler.toml", *sorted(directory.glob("*.bin"))]
    if not directory.is_dir() or not files[0].is_file() or len(files) > 33:
        raise ValueError("missing or invalid build inputs")
    if sum(path.stat().st_size for path in files) > LIMIT:
        raise ValueError("build inputs exceed size limit")
    for path in files:
        if path.is_symlink() or not allowed(path.relative_to(ROOT).as_posix()):
            raise ValueError("invalid build input")
        if path.suffix == ".bin" and hashlib.sha256(path.read_bytes()).hexdigest() != path.stem:
            raise ValueError("media checksum mismatch")
    destination = ROOT / ".local-secrets/ci-build-inputs.tar.gz"
    destination.parent.mkdir(mode=0o700, exist_ok=True)
    with destination.open("xb") as output:
        os.chmod(destination, 0o600)
        with tarfile.open(fileobj=output, mode="w:gz") as archive:
            for path in files:
                archive.add(path, arcname=path.relative_to(ROOT).as_posix(), recursive=False)
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
    url = os.environ.get("CI_BUILD_INPUTS_URL", "")
    expected = os.environ.get("CI_BUILD_INPUTS_SHA256", "").lower()
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
        if sys.argv[1:] == ["pack"]:
            pack()
        elif sys.argv[1:] == ["restore"]:
            restore()
        else:
            raise ValueError("usage: ci-build-inputs.py pack|restore")
    except Exception as error:
        # Exceptions from HTTP libraries can contain signed URLs; never print them.
        print("Build input operation failed (" + type(error).__name__ + "). Check inputs, permissions and configuration.", file=sys.stderr)
        sys.exit(1)
