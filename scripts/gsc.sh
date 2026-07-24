#!/usr/bin/env bash
# Google Search Console API helper (service-account auth).
#
# Requires gcp_service.json at the repo root — a GCP service-account key
# (project tmbprod, SA tmbservice@tmbprod.iam.gserviceaccount.com) that is a
# Full user on the sc-domain:themoviebrowser.com property. The key is
# GITIGNORED and local-only; this script fails fast if it's absent.
#
# Usage:
#   scripts/gsc.sh token                      # print a bearer token (1h)
#   scripts/gsc.sh sites                      # list accessible properties
#   scripts/gsc.sh sitemaps                   # list sitemaps + fetch/index status
#   scripts/gsc.sh submit-sitemap <url>       # (re)submit a sitemap
#   scripts/gsc.sh inspect <page-url>         # URL Inspection (index status)
#   scripts/gsc.sh query '<json>'             # Search Analytics query, e.g.
#     scripts/gsc.sh query '{"startDate":"2026-07-01","endDate":"2026-07-24","dimensions":["query"],"rowLimit":25}'
#
# NOTE: "Request indexing" is NOT exposed by any public API — manual UI only.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_JSON="$REPO_ROOT/gcp_service.json"
SITE="sc-domain:themoviebrowser.com"
API="https://www.googleapis.com/webmasters/v3"

[ -f "$KEY_JSON" ] || { echo "ERROR: $KEY_JSON not found (local-only, gitignored)" >&2; exit 1; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

mint_token() {
  local sa_email pem now exp header claims sig
  sa_email=$(python3 -c "import json;print(json.load(open('$KEY_JSON'))['client_email'])")
  pem=$(mktemp)
  trap 'rm -f "$pem"' RETURN
  python3 -c "import json;open('$pem','w').write(json.load(open('$KEY_JSON'))['private_key'])"
  now=$(date +%s); exp=$((now + 3600))
  header=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
  claims=$(printf '{"iss":"%s","scope":"https://www.googleapis.com/auth/webmasters","aud":"https://oauth2.googleapis.com/token","iat":%s,"exp":%s}' "$sa_email" "$now" "$exp" | b64url)
  sig=$(printf '%s.%s' "$header" "$claims" | openssl dgst -sha256 -sign "$pem" -binary | b64url)
  curl -s https://oauth2.googleapis.com/token \
    -d grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer \
    -d assertion="$header.$claims.$sig" |
    python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])"
}

CMD="${1:-}"
case "$CMD" in
  token) mint_token ;;
  sites)
    curl -s -H "Authorization: Bearer $(mint_token)" "$API/sites" | python3 -m json.tool ;;
  sitemaps)
    curl -s -H "Authorization: Bearer $(mint_token)" "$API/sites/$SITE/sitemaps" | python3 -m json.tool ;;
  submit-sitemap)
    [ -n "${2:-}" ] || { echo "usage: $0 submit-sitemap <sitemap-url>" >&2; exit 1; }
    ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$2")
    curl -s -o /dev/null -w "%{http_code}\n" -X PUT -H "Authorization: Bearer $(mint_token)" "$API/sites/$SITE/sitemaps/$ENC" ;;
  inspect)
    [ -n "${2:-}" ] || { echo "usage: $0 inspect <page-url>" >&2; exit 1; }
    curl -s -H "Authorization: Bearer $(mint_token)" -H "Content-Type: application/json" \
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect" \
      -d "{\"inspectionUrl\":\"$2\",\"siteUrl\":\"$SITE\"}" | python3 -m json.tool ;;
  query)
    [ -n "${2:-}" ] || { echo "usage: $0 query '<json-body>'" >&2; exit 1; }
    curl -s -H "Authorization: Bearer $(mint_token)" -H "Content-Type: application/json" \
      "$API/sites/$SITE/searchAnalytics/query" -d "$2" | python3 -m json.tool ;;
  *)
    grep '^#   ' "$0" | sed 's/^#   //'; exit 1 ;;
esac
