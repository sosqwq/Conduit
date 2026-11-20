#!/usr/bin/env python3
"""Check a running Conduit web service through its public HTTP entry point."""

import json
import sys
from html.parser import HTMLParser
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen


class EntryPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.has_root = False
        self.scripts = []
        self.styles = []

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "div" and fields.get("id") == "root":
            self.has_root = True
        if tag == "script" and fields.get("type") == "module" and fields.get("src"):
            self.scripts.append(fields["src"])
        if tag == "link" and "stylesheet" in fields.get("rel", "").split() and fields.get("href"):
            self.styles.append(fields["href"])


def check(base):
    origin = urlsplit(base)
    if origin.scheme not in ("http", "https") or not origin.netloc:
        raise ValueError("expected an absolute HTTP(S) base URL")

    def fetch(path, status=200):
        url = urljoin(base.rstrip("/") + "/", path)
        target = urlsplit(url)
        if (target.scheme, target.netloc) != (origin.scheme, origin.netloc):
            raise ValueError(f"asset points outside the application: {path}")
        try:
            response = urlopen(url, timeout=15)
        except HTTPError as error:
            response = error
        with response:
            if response.status != status:
                raise ValueError(f"{path} returned HTTP {response.status}, expected {status}")
            return response.headers, response.read()

    headers, index = fetch("/")
    entry = EntryPage()
    entry.feed(index.decode("utf-8"))
    if headers.get_content_type() != "text/html" or not (entry.has_root and entry.scripts and entry.styles):
        raise ValueError("the root response lacks the expected SPA shell, module or stylesheet")
    for path in ("/tutorial/00", "/article/deployment-check", "/profile/reader/favorites?page=2"):
        headers, page = fetch(path)
        if headers.get_content_type() != "text/html" or page != index:
            raise ValueError(f"{path} did not serve the application entry page")
    for files, types in ((entry.scripts, ("application/javascript", "text/javascript")),
                         (entry.styles, ("text/css",)), (["/assets/default-avatar.svg"], ("image/svg+xml",))):
        for asset in files:
            headers, body = fetch(asset)
            if headers.get_content_type() not in types or not body or body == index:
                raise ValueError(f"missing or incorrect production asset: {asset}")
    for path in ("/assets/conduit-missing.js", "/conduit-missing.css"):
        fetch(path, status=404)
    headers, body = fetch("/api/health")
    if headers.get_content_type() != "application/json" or json.loads(body).get("status") != "UP":
        raise ValueError("/api/health did not reach a healthy backend")
    directives = [part.strip().lower() for part in headers.get("Cache-Control", "").split(",")]
    if "no-store" not in directives:
        raise ValueError("the API response lacks Cache-Control: no-store")
    print("Web routing passed: SPA deep links, compiled JS/CSS/SVG, static 404s and uncached API health.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 scripts/check-web-routing.py http://127.0.0.1:8080")
    try:
        check(sys.argv[1])
    except (OSError, ValueError) as error:
        sys.exit(str(error))
