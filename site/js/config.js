/* Public client config — safe to ship (the anon/publishable key is designed to be public;
   Row Level Security protects the data). */
window.BR_CONFIG = {
  supabaseUrl: "https://ybycshbxsjbajyczouup.supabase.co",
  // Supabase Dashboard → Project Settings → API Keys → "anon" / publishable key
  supabaseAnonKey: "",
  otpLength: 6,
  downloadEndpoint: "/api/download",
};
