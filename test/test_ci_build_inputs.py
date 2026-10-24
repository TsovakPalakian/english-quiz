import hashlib
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
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
        with patch.object(inputs, "ROOT", root), patch.dict(os.environ, env), patch.object(inputs.urllib.request, "build_opener", return_value=opener):
            inputs.restore()

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
