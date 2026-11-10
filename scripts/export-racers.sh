#!/usr/bin/env bash
# Export every email collected by the site to a CSV.
#
#   bash scripts/export-racers.sh            → racers-YYYY-MM-DD.csv
#
# Columns: email, verified, signed_up, downloads, platforms, last_download
# Needs a Supabase access token (supabase.com/dashboard/account/tokens) — read from the
# prompt or SUPABASE_ACCESS_TOKEN, never saved.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-ybycshbxsjbajyczouup}"
OUT="${1:-racers-$(date +%Y-%m-%d).csv}"
command -v python3 >/dev/null || { echo "python3 is required"; exit 1; }

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  read -rsp "Paste Supabase access token: " SUPABASE_ACCESS_TOKEN; echo
fi
export SUPABASE_ACCESS_TOKEN REF OUT

python3 - <<'PY'
import csv, json, os, sys, urllib.request, urllib.error

sql = """
select
  u.email,
  u.email_confirmed_at is not null                         as verified,
  to_char(u.created_at, 'YYYY-MM-DD HH24:MI')              as signed_up,
  count(d.id)                                              as downloads,
  coalesce(string_agg(distinct d.platform, ', '), '')      as platforms,
  coalesce(to_char(max(d.created_at), 'YYYY-MM-DD HH24:MI'), '') as last_download
from auth.users u
left join public.downloads d on d.user_id = u.id
group by u.id
order by u.created_at desc;
"""
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{os.environ['REF']}/database/query",
    method="POST", data=json.dumps({"query": sql}).encode(),
    headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
             "Content-Type": "application/json", "User-Agent": "blossom-rally-export"})
try:
    rows = json.load(urllib.request.urlopen(req, timeout=60))
except urllib.error.HTTPError as e:
    sys.exit(f"✗ Export failed ({e.code}): {e.read().decode()[:400]}")

cols = ["email", "verified", "signed_up", "downloads", "platforms", "last_download"]
with open(os.environ["OUT"], "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in rows:
        w.writerow({c: r.get(c, "") for c in cols})

verified = sum(1 for r in rows if r.get("verified"))
dl = sum(int(r.get("downloads") or 0) for r in rows)
print(f"🌸 {len(rows)} emails ({verified} verified), {dl} downloads → {os.environ['OUT']}")
PY
