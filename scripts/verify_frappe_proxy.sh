#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <domain> [asset_path]" >&2
  echo "Example: $0 example.com /assets/frappe/css/desk.min.css" >&2
  exit 1
fi

domain="$1"
asset_path="${2:-/assets/frappe/css/desk.min.css}"

asset_url="https://${domain}${asset_path}"
api_url="https://${domain}/api/method/ping"

printf "Checking asset: %s\n" "$asset_url"
asset_headers=$(curl -sS -I "$asset_url")
status_line=$(printf "%s" "$asset_headers" | head -n 1)
content_type=$(printf "%s" "$asset_headers" | awk -F': ' 'tolower($1)=="content-type" {print $2}' | head -n 1)

printf "Status: %s\n" "$status_line"
printf "Content-Type: %s\n" "$content_type"

if ! printf "%s" "$status_line" | grep -q " 200 "; then
  echo "Expected 200 for asset request." >&2
  exit 1
fi

if ! printf "%s" "$content_type" | grep -qi "text/css"; then
  echo "Expected Content-Type to include text/css." >&2
  exit 1
fi

printf "\nChecking API: %s\n" "$api_url"
api_response=$(curl -sS "$api_url")

printf "Response: %s\n" "$api_response"

if ! printf "%s" "$api_response" | grep -q '"message"'; then
  echo "Expected JSON response with a 'message' field." >&2
  exit 1
fi

echo "\nVerification passed."
