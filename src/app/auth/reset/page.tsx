"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AppShell } from "@/components/ui/app-shell";
import { Card, Pill } from "@/components/ui/primitives";
import { Feedback } from "@/components/ui/states";
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
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({
        password: String(new FormData(e.currentTarget).get("password")),
      });
      if (error) throw error;
      setMessage("Password updated. You can return to your library.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell active="Profile" compact>
      <Card className="panel wb-auth-panel">
        <Pill>A FRESH START</Pill>
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
        {message && <Feedback>{message}</Feedback>}
        <Link href="/library">Go to library →</Link>
      </Card>
    </AppShell>
  );
}
