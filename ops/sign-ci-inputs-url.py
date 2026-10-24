"""Sign one uploaded CI archive locally; never print credentials or the URL."""
from datetime import datetime, timedelta, timezone
from getpass import getpass
import os
from pathlib import Path
import sys

import boto3
from botocore.config import Config


ACCOUNT = "42a9ebe47d529e3664b914aaf0813a21"
BUCKET = "learn-english-ci-inputs"
DIGEST = "0d97e992aae6a19968bfcc8bf4668fd672099cb6b98420a49d7eb11d1f215b6d"
EXPIRES = 604800


def main():
    if not sys.stdin.isatty():
        raise ValueError("Run in an interactive terminal for hidden credential input.")
    os.umask(0o077)
    directory = Path(__file__).resolve().parent.parent / ".local-secrets"
    if directory.is_symlink():
        raise ValueError("Private output directory must not be a symlink.")
    directory.mkdir(mode=0o700, exist_ok=True)
    os.chmod(directory, 0o700)
    destination = directory / "ci-build-inputs-url.txt"
    if destination.exists() or destination.is_symlink():
        raise ValueError("URL file already exists; move it before generating a replacement.")
    key = getpass("R2 Access Key ID (hidden): ").strip()
    secret = getpass("R2 Secret Access Key (hidden): ").strip()
    if not key or not secret or any(c.isspace() for c in key + secret):
        raise ValueError("Provide non-empty R2 credentials without whitespace.")
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{ACCOUNT}.r2.cloudflarestorage.com",
        region_name="auto",
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )
    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET, "Key": f"ci-build-inputs/{DIGEST}.tar.gz"},
            ExpiresIn=EXPIRES,
            HttpMethod="GET",
        )
    finally:
        client.close()
    with destination.open("x", encoding="utf8") as output:
        output.write(url)
    print(f"Saved private URL: {destination}")
    print("Expires approximately: " + (datetime.now(timezone.utc) + timedelta(seconds=EXPIRES)).isoformat())
    print("Set GitHub Secret CI_BUILD_INPUTS_URL from this file. No network request or test was run.")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("Cancelled; no credentials were saved.", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        # SDK errors may contain credentials or a signed URL.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print("Could not generate the private URL; no secret details were logged.", file=sys.stderr)
        sys.exit(1)
