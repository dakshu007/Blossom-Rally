#!/usr/bin/env bash
# One-time Supabase setup for the Blossom Rally site.
#
#   bash scripts/setup-supabase.sh
#
# What it does (via the Supabase Management API):
#   1. Sends auth emails through Resend SMTP (your Resend key goes to Supabase only)
#   2. Switches the sign-in emails to a 6-digit code ({{ .Token }}) with the Blossom Rally template
#   3. Raises the email rate limit (custom SMTP allows it)
#   4. Creates the `downloads` log table (supabase/migrations/*.sql)
#   5. Writes the public anon key into site/js/config.js
#
# Secrets are read from the prompt, kept in memory, and never written to disk or the repo.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-ybycshbxsjbajyczouup}"
cd "$(dirname "$0")/.."
command -v python3 >/dev/null || { echo "python3 is required (macOS: xcode-select --install)"; exit 1; }

echo "🌸 Blossom Rally — Supabase setup for project $REF"
echo
echo "Supabase access token: https://supabase.com/dashboard/account/tokens  (Generate new token)"
read -rsp "  Paste Supabase access token: " SB_TOKEN; echo
read -rsp "  Paste Resend API key (re_...): " RESEND_KEY; echo
echo "Sender address must be on a domain verified in Resend (resend.com/domains)."
read -rp  "  Sender email (e.g. racers@yourdomain.com): " SENDER
read -rp  "  Sender name [Blossom Rally]: " SENDER_NAME
SENDER_NAME="${SENDER_NAME:-Blossom Rally}"

export SB_TOKEN RESEND_KEY SENDER SENDER_NAME REF
python3 - <<'PY'
import glob, json, os, re, sys, urllib.request, urllib.error

ref, token = os.environ["REF"], os.environ["SB_TOKEN"]
API = f"https://api.supabase.com/v1/projects/{ref}"

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "User-Agent": "blossom-rally-setup"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode() or "null"
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        sys.exit(f"\n✗ {method} {path} failed ({e.code}): {e.read().decode()[:500]}")

template = open("supabase/email-templates/magic-link.html", encoding="utf-8").read()
subject = "Your Blossom Rally code: {{ .Token }}"

print("\n1/3  Email: Resend SMTP + 6-digit code template …")
call("PATCH", "/config/auth", {
    "external_email_enabled": True,
    "smtp_host": "smtp.resend.com",
    "smtp_port": "465",
    "smtp_user": "resend",
    "smtp_pass": os.environ["RESEND_KEY"],
    "smtp_admin_email": os.environ["SENDER"],
    "smtp_sender_name": os.environ["SENDER_NAME"],
    "rate_limit_email_sent": 200,
    "mailer_otp_length": 6,
    # Existing racers get the Magic Link template, brand-new ones the Confirm signup template:
    # both carry the code so every first-time and returning racer receives 6 digits.
    "mailer_subjects_magic_link": subject,
    "mailer_templates_magic_link_content": template,
    "mailer_subjects_confirmation": subject,
    "mailer_templates_confirmation_content": template,
})
print("     ✓ done")

print("2/3  Database: downloads log …")
for f in sorted(glob.glob("supabase/migrations/*.sql")):
    call("POST", "/database/query", {"query": open(f, encoding="utf-8").read()})
    print(f"     ✓ {os.path.basename(f)}")

print("3/3  Site config: public anon key …")
keys = call("GET", "/api-keys") or []
key = next((k["api_key"] for k in keys if k.get("name") == "anon" and k.get("api_key")), None) \
   or next((k["api_key"] for k in keys if k.get("type") == "publishable" and k.get("api_key")), None)
if not key:
    sys.exit("✗ Could not find an anon/publishable key — copy it from Project Settings → API Keys into site/js/config.js")
cfg = "site/js/config.js"
src = open(cfg, encoding="utf-8").read()
src = re.sub(r'supabaseAnonKey:\s*"[^"]*"', f'supabaseAnonKey: "{key}"', src)
open(cfg, "w", encoding="utf-8").write(src)
print(f"     ✓ wrote key to {cfg}")
print("\n🏁 Supabase is ready. Commit the config change:\n"
      "   git add site/js/config.js && git commit -m 'Add Supabase anon key' && git push")
PY
