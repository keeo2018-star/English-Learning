import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const callbackPaths = ["/auth/callback", "/auth/confirm"];
const legacyImplicitLink =
  typeof window !== "undefined" &&
  !callbackPaths.includes(window.location.pathname) &&
  new URLSearchParams(window.location.hash.slice(1)).has("access_token");
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          flowType: legacyImplicitLink ? "implicit" : "pkce",
          // The callback explicitly exchanges credentials once. Keep automatic handling
          // elsewhere for older confirmation emails that targeted /library directly.
          detectSessionInUrl:
            typeof window !== "undefined" &&
            !["/auth/callback", "/auth/confirm"].includes(
              window.location.pathname,
            ),
        },
      })
    : null;
