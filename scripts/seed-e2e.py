#!/usr/bin/env python3
"""Provide the two baseline authors expected by the official browser suite."""
import argparse
import json
from http.client import HTTPConnection
from urllib.parse import urlencode, urlsplit


def local_api(value):
    url = urlsplit(value)
    if (url.scheme != "http" or url.hostname not in {"127.0.0.1", "::1", "localhost"}
            or url.username is not None or url.password is not None or url.query or url.fragment
            or url.path.rstrip("/") != "/api"):
        raise argparse.ArgumentTypeError("expected http://127.0.0.1:PORT/api or another loopback address")
    try:
        port = url.port
    except ValueError as error:
        raise argparse.ArgumentTypeError("invalid local API port") from error
    host = "127.0.0.1" if url.hostname == "localhost" else url.hostname
    return host, port


def request(address, method, path, payload=None, token=None, expected=(200,)):
    # A direct connection follows neither redirects nor proxy settings.
    conn = HTTPConnection(*address, timeout=10)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Token " + token
    try:
        conn.request(method, "/api" + path, json.dumps(payload) if payload is not None else None, headers)
        response = conn.getresponse()
        if response.status not in expected:
            raise SystemExit(f"Seed request failed: {method} {path} returned HTTP {response.status}")
        return response.status, json.load(response)
    finally:
        conn.close()


def seed_author(address, username, title, tag):
    query = urlencode({"author": username, "tag": tag, "limit": 1})
    _, page = request(address, "GET", "/articles?" + query)
    if page["articlesCount"] > 0:
        return

    # The same credentials allow recovery after registration succeeds but publishing fails.
    credentials = {"email": username + "@browser-fixture.invalid", "password": "local-browser-fixture-only"}
    status, data = request(address, "POST", "/users", {"user": {"username": username, **credentials}},
                           expected=(201, 409))
    if status == 409:
        status, data = request(address, "POST", "/users/login", {"user": credentials}, expected=(200, 401))
        if status == 401 or data["user"]["username"] != username:
            # An existing demo account may already own articles under different tags.
            _, page = request(address, "GET", "/articles?" + urlencode({"author": username, "limit": 1}))
            if page["articlesCount"] > 0:
                return
            raise SystemExit(f"Existing fixture author {username} has no articles and is owned by another login")
    token = data["user"]["token"]
    article = {"title": title, "description": "A field note from the Conduit tutorial.",
               "body": "Read the article, visit its author, or follow the discussion.",
               "tagList": [tag, "conduit"]}
    request(address, "POST", "/articles", {"article": article}, token, expected=(201,))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("api", type=local_api, help="loopback API URL for the disposable test database")
    args = parser.parse_args()
    seed_author(args.api, "johndoe", "Notes from the Conduit community", "community")
    seed_author(args.api, "conduit_editor", "Getting started with Markdown", "markdown")
    print("E2E baseline ready: johndoe and conduit_editor have articles.")
