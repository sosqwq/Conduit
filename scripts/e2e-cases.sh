#!/usr/bin/env bash
# Print one Playwright selector per line. Locations refer to the pinned upstream
# files verified by official.sh. Playwright still executes each entire test.
set -euo pipefail

case ${1:-} in
  m6|m7) stage=$1 ;;
  m8|m9) exit 0 ;; # No selectors: discover and execute every upstream test.
  *) echo "Usage: $0 {m6|m7|m8|m9}" >&2; exit 2 ;;
esac

cases() {
  local path="scripts/official-specs/specs/e2e/$1.spec.ts" line
  shift
  if (($# == 0)); then
    printf '%s\n' "$path"
  else
    for line in "$@"; do printf '%s:%s\n' "$path" "$line"; done
  fi
}

# M6 covers sign-in, account settings, route guards and the navigation shell.
# Settings cases 150/175 assert content rendered by the M8 profile page.
cases auth
cases health
cases settings 20 68 107 200 225
cases navigation 21 40
cases null-fields 33 138 145
cases error-handling 36 50 104 473 553 593 607
cases xss-security 164

if [[ $stage == m6 ]]; then
  # The two remaining user-fetch cases also assert feed content (M7).
  cases user-fetch-errors 21 71 93 117 179 196 213 230 260 274 288 301
  cases url-navigation 33
  exit 0
fi

# M7 adds feeds, tag routes, pagination, editor, article details and comments.
# Favorite/unfavorite controls, profile content and follows arrive together in M8.
cases user-fetch-errors
cases url-navigation
cases comments
cases articles 32 51 73 99 187 213 235 288
cases navigation 63 109 139 160 183
cases null-fields 42 53 152
cases error-handling 68 136 199 252 379 390 410 451 462 505 532 543 622 650 698 862 876 890
# The other security cases render the author's profile and its article list.
cases xss-security 186 258
