import hashlib
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("build_inputs", Path(__file__).resolve().parent.parent / "ops/ci-build-inputs.py")
inputs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inputs)


class BuildInputsTests(unittest.TestCase):
    def restore(self, root, archive, digest=None):
        env = {"CI_BUILD_INPUTS_URL": "https://example.invalid/private-archive", "CI_BUILD_INPUTS_SHA256": digest or hashlib.sha256(archive).hexdigest()}
        opener = unittest.mock.Mock()
        opener.open.return_value = io.BytesIO(archive)
        with patch.object(inputs, "ROOT", root), patch.dict(os.environ, env, clear=True), patch.object(inputs.urllib.request, "build_opener", return_value=opener):
            inputs.restore()

    def test_r2_signature_is_fresh_scoped_and_never_printed(self):
        client = unittest.mock.Mock()
        client.generate_presigned_url.side_effect = ["https://example.invalid/first-signature", "https://example.invalid/second-signature"]
        factory = unittest.mock.Mock(return_value=client)
        config = unittest.mock.Mock(return_value="fixture-config")
        modules = {"boto3": SimpleNamespace(client=factory), "botocore.config": SimpleNamespace(Config=config)}
        env = {"CI_R2_ACCESS_KEY_ID": "fixture-key", "CI_R2_SECRET_ACCESS_KEY": "fixture-secret", "CI_BUILD_INPUTS_URL": "https://example.invalid/stale"}
        with patch.dict(os.environ, env, clear=True), patch.dict("sys.modules", modules), patch("builtins.print") as printed:
            self.assertEqual(inputs.build_input_url("a" * 64), "https://example.invalid/first-signature")
            self.assertEqual(inputs.build_input_url("a" * 64), "https://example.invalid/second-signature")
            printed.assert_not_called()
        config.assert_called_with(signature_version="s3v4", s3={"addressing_style": "path"})
        factory.assert_called_with("s3", endpoint_url=f"https://{inputs.R2_ACCOUNT}.r2.cloudflarestorage.com", region_name="auto", aws_access_key_id="fixture-key", aws_secret_access_key="fixture-secret", config="fixture-config")
        self.assertEqual(client.close.call_count, 2)
        client.generate_presigned_url.assert_called_with("get_object", Params={"Bucket": inputs.R2_BUCKET, "Key": "ci-build-inputs/" + "a" * 64 + ".tar.gz"}, ExpiresIn=900, HttpMethod="GET")

    def test_r2_rejects_partial_credentials_and_bad_digest(self):
        for env in [{"CI_R2_ACCESS_KEY_ID": "fixture-key"}, {"CI_R2_SECRET_ACCESS_KEY": "fixture-secret"}, {"CI_R2_ACCESS_KEY_ID": "bad key", "CI_R2_SECRET_ACCESS_KEY": "fixture-secret"}]:
            with self.subTest(env=list(env)), patch.dict(os.environ, {**env, "CI_BUILD_INPUTS_URL": "https://example.invalid/stale"}, clear=True):
                with self.assertRaises(ValueError):
                    inputs.build_input_url("a" * 64)
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValueError):
            inputs.build_input_url("../invalid")

    def test_r2_signing_failure_closes_client(self):
        client = unittest.mock.Mock()
        client.generate_presigned_url.side_effect = RuntimeError("fixture signing failure")
        modules = {"boto3": SimpleNamespace(client=unittest.mock.Mock(return_value=client)), "botocore.config": SimpleNamespace(Config=unittest.mock.Mock())}
        with patch.dict(os.environ, {"CI_R2_ACCESS_KEY_ID": "fixture-key", "CI_R2_SECRET_ACCESS_KEY": "fixture-secret"}, clear=True), patch.dict("sys.modules", modules):
            with self.assertRaises(RuntimeError):
                inputs.build_input_url("a" * 64)
        client.close.assert_called_once()

    def archive(self, names):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w:gz") as archive:
            for name, kind in names:
                entry = tarfile.TarInfo(name)
                if kind == "symlink":
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = "../outside"
                    archive.addfile(entry)
                else:
                    data = b"fixture"
                    entry.size = len(data)
                    archive.addfile(entry, io.BytesIO(data))
        return output.getvalue()

    def test_pack_restore_only_allowlisted_files(self):
        with tempfile.TemporaryDirectory() as source, tempfile.TemporaryDirectory() as target:
            root = Path(source)
            (root / inputs.MEDIA).mkdir(parents=True)
            content = b"fixture media"
            name = hashlib.sha256(content).hexdigest() + ".bin"
            (root / inputs.MEDIA / name).write_bytes(content)
            (root / "wrangler.toml").write_text('name = "fixture"\n')
            (root / ".env").write_text("MUST_NOT_BE_PACKED=fixture\n")
            with patch.object(inputs, "ROOT", root), patch("builtins.print"):
                inputs.pack()
            packed = (root / ".local-secrets/ci-build-inputs.tar.gz").read_bytes()
            destination = Path(target)
            self.restore(destination, packed)
            self.assertEqual((destination / inputs.MEDIA / name).read_bytes(), content)
            self.assertFalse((destination / ".env").exists())
            self.assertEqual((destination / "wrangler.toml").stat().st_mode & 0o777, 0o600)

    def test_rejects_traversal_links_duplicates_and_unexpected_files(self):
        for entries in [[("../outside", "file")], [("/outside", "file")], [("wrangler.toml", "symlink")], [(".env", "file")], [("wrangler.toml", "file"), ("wrangler.toml", "file")]]:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as directory:
                with self.assertRaises(ValueError):
                    self.restore(Path(directory), self.archive(entries))

    def test_rejects_wrong_checksum_and_preserves_existing_files(self):
        packed = self.archive([("wrangler.toml", "file")])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                self.restore(root, packed, "0" * 64)
            (root / "wrangler.toml").write_text("keep me")
            with self.assertRaises(FileExistsError):
                self.restore(root, packed)
            self.assertEqual((root / "wrangler.toml").read_text(), "keep me")

    def test_trusted_root_alias_uses_its_canonical_location(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            destination = base / "destination"
            destination.mkdir()
            alias = base / "alias"
            alias.symlink_to(destination, target_is_directory=True)
            self.restore(alias, self.archive([("wrangler.toml", "file")]))
            self.assertEqual((destination / "wrangler.toml").read_bytes(), b"fixture")

    def test_archive_cannot_follow_a_parent_link_outside_the_root(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as outside:
            root = Path(directory)
            (root / "private").symlink_to(Path(outside), target_is_directory=True)
            media = inputs.MEDIA + "/" + "0" * 64 + ".bin"
            with self.assertRaises(ValueError):
                self.restore(root, self.archive([("wrangler.toml", "file"), (media, "file")]))
            self.assertEqual(list(Path(outside).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
