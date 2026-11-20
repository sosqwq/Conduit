import base64
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().with_name('init-production-env.sh')


class ProductionEnvironmentTest(unittest.TestCase):
    def test_generates_private_credentials_and_preserves_an_existing_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            def initialize():
                return subprocess.run(['bash', SCRIPT], cwd=directory, capture_output=True)

            first = initialize()
            self.assertEqual(0, first.returncode, first.stderr)
            env_file = Path(directory) / '.env.production'
            self.assertEqual(0o600, stat.S_IMODE(os.stat(env_file).st_mode))
            original = env_file.read_bytes()
            values = dict(line.split('=', 1) for line in original.decode().splitlines())
            database_key = bytes.fromhex(values['DATABASE_PASSWORD'])
            signing_key = base64.b64decode(values['CONDUIT_JWT_SECRET'], validate=True)
            self.assertGreaterEqual(len(database_key), 32)
            self.assertGreaterEqual(len(signing_key), 32)
            self.assertNotEqual(database_key, signing_key)
            again = initialize()
            self.assertEqual(0, again.returncode, again.stderr)
            self.assertEqual(env_file.read_bytes(), original)
            for value in values.values():
                self.assertNotIn(value.encode(), first.stdout + first.stderr + again.stdout + again.stderr)
