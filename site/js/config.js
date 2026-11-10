/* Public client config — safe to ship (the anon/publishable key is designed to be public;
   Row Level Security protects the data). */
window.BR_CONFIG = {
  supabaseUrl: "https://ybycshbxsjbajyczouup.supabase.co",
  // Supabase Dashboard → Project Settings → API Keys → "anon" / publishable key
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlieWNzaGJ4c2piYWp5Y3pvdXVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMDkyMzEsImV4cCI6MjEwOTg4NTIzMX0.-yaKlvouzxRudlMsmJQOoy17EzTFcnyOjCGBGyLN1nI",
  otpLength: 6,
  downloadEndpoint: "/api/download",
  // Google Apps Script web app URL (…/exec) — see google-sheets/Code.gs
  sheetsWebhook: "",
};
