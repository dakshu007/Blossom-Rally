# Blossom Rally — website

Landing page for **Blossom Rally**, a low-poly drift rally game set in a cherry-blossom valley.
Free testing build for macOS & Windows — new build every Thursday.

Live: https://blossomrally.netlify.app

## What's here

```
site/                     static site (Netlify publish dir)
  index.html              page
  css/style.css           styles
  js/audio.js             sound engine (ElevenLabs samples + WebAudio engine/screech synth)
  js/main.js              gate, petals, scroll-throttle speedo, drift road, rev gauge, countdown
  js/drift-lot.js         in-browser top-down drift mini-game
  js/download.js          start lights → drift → email → OTP → download
  js/config.js            Supabase URL + anon key (public)
  assets/                 gameplay video, screenshots, sound effects
netlify/functions/
  download.mjs            /api/download — checks the Supabase session, returns the GitHub Release URL
supabase/
  migrations/             `downloads` table + `racers` view
  email-templates/        OTP email (Magic Link template with {{ .Token }})
.github/workflows/
  sync-builds.yml         copies the builds from Google Drive into the GitHub Release `latest-build`
```

## How downloads work

1. Visitor clicks **Download** → start lights, GO, drift animation.
2. Enters email → Supabase sends a 6-digit code (`signInWithOtp`).
3. Code verified (`verifyOtp`) → session saved in the browser, so returning racers skip the code.
4. Page calls `/api/download?platform=mac|windows` with the session token. The function checks it
   with Supabase, logs the download, and returns the GitHub Release asset URL.
5. The browser downloads the build (.dmg / .zip) directly from GitHub. No Google Drive page is ever shown.

## Shipping a new build (every Thursday)

The **Sync game builds** workflow runs every Thursday and copies the current Google Drive files into
the `latest-build` release as `BlossomRally-macOS.<ext>` and `BlossomRally-Windows.<ext>`, keeping each
build's own format (.dmg / .zip; anything else gets zipped).

- Easiest: in Google Drive, right-click the file → **Manage versions → Upload new version** (keeps the
  same link), then wait for Thursday or run the workflow from the **Actions** tab.
- New Drive file? Run the workflow manually and paste the new file IDs, or set repository variables
  `MAC_DRIVE_ID` / `WINDOWS_DRIVE_ID`.
- Drive files must be shared as **Anyone with the link**.

## One-time setup

**Supabase** (project `ybycshbxsjbajyczouup`)
1. Paste the anon/publishable key into `site/js/config.js` → `supabaseAnonKey`.
2. Authentication → Email Templates → **Magic Link**: paste `supabase/email-templates/magic-link.html`
   and set the subject to `Your Blossom Rally code: {{ .Token }}`. The `{{ .Token }}` placeholder is what
   makes Supabase send a code instead of a link.
3. Authentication → Sign In / Providers → Email: keep **Enable email provider** on.
4. Run `supabase/migrations/20261110000000_downloads.sql` in the SQL editor.
5. Recommended: Authentication → SMTP — connect your own SMTP (Resend, Postmark…). Supabase's built-in
   mailer is only for testing and allows very few emails per hour.

**Netlify** (project `blossomrally`)
- Link this repo (Project configuration → Build & deploy → Link repository). `netlify.toml` already
  sets the publish dir to `site` and the functions dir. Every push then deploys.
- Optional env vars: `SUPABASE_ANON_KEY`, `BUILDS_REPO`, `BUILDS_TAG`.

## Local preview

```bash
cd site && python3 -m http.server 8080
```

The download step needs the Netlify function, so use `netlify dev` from the repo root to test it end to end.
