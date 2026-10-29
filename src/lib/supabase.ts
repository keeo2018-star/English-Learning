import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
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
