#!/usr/bin/env python3
"""Verify the vendored RealWorld files against upstream Git blob IDs."""

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
manifest = ROOT / "scripts/official-blobs.txt"
expected = {}
for line in manifest.read_text(encoding="utf-8").splitlines():
    digest, path = line.split("  ", maxsplit=1)
    expected[ROOT / path] = digest

actual = set()
for directory in ("scripts/official-specs", "frontend/src/official"):
    actual.update(p for p in (ROOT / directory).rglob("*") if p.is_file())

errors = []
for path in sorted(actual - expected.keys()):
    errors.append(f"unexpected file: {path.relative_to(ROOT)}")
for path, digest in expected.items():
    if path not in actual:
        errors.append(f"missing file: {path.relative_to(ROOT)}")
        continue
    data = path.read_bytes()
    # Git hashes the object type and byte count along with the bytes of the file.
    header = f"blob {len(data)}\0".encode("ascii")
    if hashlib.sha1(header + data, usedforsecurity=False).hexdigest() != digest:
        errors.append(f"upstream content mismatch: {path.relative_to(ROOT)}")

if errors:
    raise SystemExit("\n".join(errors))
print(f"Verified {len(expected)} upstream files against their Git blob IDs.")
