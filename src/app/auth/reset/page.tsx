"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
export default function Reset() {
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      else if (data.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: String(new FormData(e.currentTarget).get("password")),
    });
    setMessage(
      error
        ? error.message
        : "Password updated. You can return to your library.",
    );
    setBusy(false);
  }
  return (
    <main className="auth">
      <section className="panel">
        <h1>Choose a new password.</h1>
        {ready ? (
          <form onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <button disabled={busy}>Update password</button>
          </form>
        ) : (
          <p>Open the password recovery link from your email to continue.</p>
        )}
        {message && <p role="status">{message}</p>}
        <Link href="/library">Go to library →</Link>
      </section>
    </main>
  );
}
