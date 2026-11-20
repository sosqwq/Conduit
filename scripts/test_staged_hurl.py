import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from staged_hurl import run_ranges


class CaptureHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.paths.append(self.path)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"id":"captured-value"}')

    def log_message(self, *args):
        pass


class RangeTest(unittest.TestCase):
    def test_native_capture_is_reused_across_noncontiguous_ranges(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'flow.hurl'
            source.write_text(
                'GET {{host}}/setup\nHTTP 200\n[Captures]\nid: jsonpath "$.id"\n\n'
                'GET {{host}}/later-milestone\nHTTP 404\n\n'
                'GET {{host}}/{{id}}\nHTTP 200\n[Asserts]\njsonpath "$.id" == "{{id}}"\n'
            )
            with ThreadingHTTPServer(('127.0.0.1', 0), CaptureHandler) as server:
                server.paths = []
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                host = f'http://127.0.0.1:{server.server_port}'
                try:
                    with patch.dict(os.environ, no_proxy='127.0.0.1'):
                        run_ranges(source, ((1, 1), (3, 3)), host, 'test')
                        self.assertEqual(server.paths, ['/setup', '/captured-value'])
                        with self.assertRaises(RuntimeError):
                            run_ranges(source, ((2, 2), (3, 3)), host, 'test')
                        self.assertEqual(server.paths[-1], '/later-milestone')
                finally:
                    server.shutdown()
                    thread.join()
