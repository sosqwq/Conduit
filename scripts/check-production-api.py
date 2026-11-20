"""Exercise the disposable Compose project's API through its web listener."""

import argparse
import http.client
import json
import secrets
from pathlib import Path
from urllib.parse import quote, urlencode


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def request(port, method, path, status, data=None, token=None):
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    if method == "POST":
        headers["Origin"] = f"http://127.0.0.1:{port}"
    if token:
        headers["Authorization"] = f"Token {token}"
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
    try:
        connection.request(method, "/api" + path, json.dumps(data) if data is not None else None, headers)
        response = connection.getresponse()
        require(response.status == status, f"{method} /api{path} returned {response.status}, expected {status}.")
        require(response.getheader("Content-Type", "").startswith("application/json"),
                f"{method} /api{path} returned an unexpected content type.")
        return json.loads(response.read())
    finally:
        connection.close()


def login(port, fixture):
    user = request(port, "POST", "/users/login", 200, {"user": {
        "email": fixture["email"], "password": fixture["password"],
    }})["user"]
    require(user["username"] == fixture["username"] and user["token"], "Login returned an unexpected user.")
    return user["token"]


def create(port):
    nonce = secrets.token_hex(6)
    fixture = {
        "username": "verify" + nonce,
        "email": f"verify-{nonce}@example.invalid",
        "password": secrets.token_urlsafe(30),
        "article": {"title": f"Production check {nonce}", "description": "A persistence check",
                    "body": "This article survives container replacement.", "tagList": ["verification"]},
    }
    credentials = {key: fixture[key] for key in ("username", "email", "password")}
    registered = request(port, "POST", "/users", 201, {"user": credentials})["user"]
    require(registered["username"] == fixture["username"], "Registration returned an unexpected user.")
    fixture["token"] = login(port, fixture)
    article = request(port, "POST", "/articles", 201, {"article": fixture["article"]}, fixture["token"])["article"]
    require(isinstance(article["slug"], str) and article["slug"], "Article creation returned no slug.")
    fixture["slug"] = article["slug"]
    return fixture


def verify(port, fixture):
    user = request(port, "GET", "/user", 200, token=fixture["token"])["user"]
    require(user["username"] == fixture["username"], "The original token did not identify the registered user.")
    query = urlencode({"author": fixture["username"]})
    page = request(port, "GET", "/articles?" + query, 200)
    require(page["articlesCount"] == 1 and [item["slug"] for item in page["articles"]] == [fixture["slug"]],
            "The author's public list did not contain exactly the created article.")
    detail = request(port, "GET", "/articles/" + quote(fixture["slug"], safe=""), 200)["article"]
    require(detail["author"]["username"] == fixture["username"], "The public article author changed.")
    for field, value in fixture["article"].items():
        require(detail[field] == value, f"The public article's {field} did not match the stored value.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("create", "verify"))
    parser.add_argument("port", type=int)
    parser.add_argument("fixture", type=Path)
    args = parser.parse_args()
    if args.mode == "create":
        state = create(args.port)
        with args.fixture.open("x", encoding="utf-8") as file:
            json.dump(state, file)
    else:
        state = json.loads(args.fixture.read_text(encoding="utf-8"))
        login(args.port, state)
    verify(args.port, state)
