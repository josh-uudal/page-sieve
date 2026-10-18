"""Serve the project for the test pages, with caching off so edits show up on reload.

    python test/serve.py            -> http://localhost:8766/test/unit.html
    python test/serve.py 9000
"""
import functools
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
print(f"Serving {ROOT} at http://localhost:{port}/test/unit.html")
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(NoCache, directory=str(ROOT))).serve_forever()
