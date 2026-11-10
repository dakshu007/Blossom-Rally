// Gated download: only a verified Supabase session gets the build URL.
// GET /api/download?platform=mac|windows   (Authorization: Bearer <supabase access token>)
// → { url } pointing at the GitHub Release asset, which downloads directly (no Google Drive page).

const env = (k) => (globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || "";

const SUPABASE_URL = env("SUPABASE_URL") || "https://ybycshbxsjbajyczouup.supabase.co";
const REPO = env("BUILDS_REPO") || "dakshu007/blossom-rally";
const TAG = env("BUILDS_TAG") || "latest-build";
const FILES = { mac: "BlossomRally-macOS.zip", windows: "BlossomRally-Windows.zip" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  if (!FILES[platform]) return json({ error: "bad_platform" }, 400);

  const auth = req.headers.get("authorization") || "";
  // The anon key is public by design; prefer the env var, fall back to the one the page sends.
  const apikey = env("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!auth.startsWith("Bearer ") || !apikey) return json({ error: "unauthorized" }, 401);

  // Supabase validates the JWT signature for us.
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey, Authorization: auth } });
  if (!who.ok) return json({ error: "unauthorized" }, 401);
  const user = await who.json();
  if (!user || !user.email || !(user.email_confirmed_at || user.confirmed_at)) {
    return json({ error: "unverified" }, 403);
  }

  const asset = `https://github.com/${REPO}/releases/download/${TAG}/${FILES[platform]}`;
  const head = await fetch(asset, { method: "HEAD", redirect: "manual" }).catch(() => null);
  if (!head || head.status === 404) return json({ error: "build_not_ready" }, 503);

  // Best-effort download log (table from supabase/migrations). Never blocks the download.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/downloads`, {
      method: "POST",
      headers: { apikey, Authorization: auth, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: user.id,
        email: user.email,
        platform,
        user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
      }),
      signal: AbortSignal.timeout(2500),
    });
  } catch (e) {}

  return json({ url: asset });
};

export const config = { path: "/api/download" };
