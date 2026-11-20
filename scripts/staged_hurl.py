"""Run the applicable entries of the pinned RealWorld suite at each API milestone."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

SUITE = Path(__file__).resolve().parent / 'official-specs/specs/api'
ACCOUNTS = ('auth', 'errors_auth')
PROFILES = ('profiles', 'errors_profiles')
# Entry numbers are 1-based and inclusive. The unmodified files supply every assertion.
M3_RANGES = {
    'articles': ((1, 2), (9, 17)),
    'errors_articles': ((1, 4), (8, 14), (17, 20)),
    'errors_authorization': ((1, 5), (9, 9)),
    'pagination': ((1, 3), (6, 7)),
    'feed': ((1, 2), (4, 6), (10, 12)),
    'comments': ((1, 2), (13, 13)),
    'errors_comments': ((3, 4), (10, 10)),
    'favorites': ((1, 2), (9, 9)),
}
M4_RANGES = {
    name: ranges for name, ranges in M3_RANGES.items()
    if name not in ('articles', 'pagination', 'feed')
}
M4_RANGES['errors_articles'] = ((1, 5), (8, 14), (17, 20))


def run_ranges(source, ranges, host, uid):
    variables = {'host': host, 'uid': uid}
    for start, end in ranges:
        label = f'{source.name}, entries {start}–{end}'
        args = ['hurl', '--json', '--test', '--from-entry', str(start), '--to-entry', str(end)]
        for name, value in variables.items():
            option = '--secret' if 'token' in name else '--variable'
            args.extend([option, f'{name}={value}'])
        result = subprocess.run([*args, str(source)], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(f'{label} failed\n{result.stderr.strip()}')
        report = json.loads(result.stdout)
        entries = report['entries']
        if not report['success'] or [e['index'] for e in entries] != list(range(start, end + 1)):
            raise RuntimeError(f'{label}: Hurl did not verify the full requested range')
        for entry in entries:
            for capture in entry['captures']:
                variables[capture['name']] = capture['value']
        print(f'Passed {label}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('milestone', choices=[f'm{i}' for i in range(1, 10)])
    milestone = parser.parse_args().milestone
    complete = {
        'm1': ACCOUNTS,
        'm2': ACCOUNTS + PROFILES,
        'm3': ACCOUNTS + PROFILES + ('tags',),
        'm4': ACCOUNTS + PROFILES + ('tags', 'articles', 'pagination', 'feed'),
    }
    # With no file arguments, the upstream runner discovers and executes the entire suite.
    paths = [SUITE / 'hurl' / f'{name}.hurl' for name in complete.get(milestone, ())]
    host = os.environ.get('HOST', 'http://127.0.0.1:8080')
    result = subprocess.run(['bash', SUITE / 'run-api-tests-hurl.sh', *paths],
                            env={**os.environ, 'HOST': host})
    if result.returncode:
        return result.returncode
    mixed = {'m3': M3_RANGES, 'm4': M4_RANGES}.get(milestone, {})
    try:
        for name, ranges in mixed.items():
            run_ranges(SUITE / 'hurl' / f'{name}.hurl', ranges, host, secrets.token_hex(8))
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
