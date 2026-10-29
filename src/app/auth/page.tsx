"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin"),
    [message, setMessage] = useState(
      params.get("error") === "auth_callback"
        ? "We couldn’t complete the email confirmation. The link may have expired or already been used. Open a new link in the browser where you signed up, or sign in if your email is already confirmed."
        : "",
    ),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")),
      password = String(f.get("password"));
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: new URL(
            "/auth/callback?next=/auth/reset",
            location.origin,
          ).toString(),
        });
        if (error) throw error;
        setMessage("Check your email for a password reset link.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL(
              "/auth/callback",
              location.origin,
            ).toString(),
          },
        });
        if (error) throw error;
        if (data.session) router.push("/library");
        else
          setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push("/library");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <Link className="brand" href="/">
        wordbook
      </Link>
      <section className="panel">
        <div className="eyebrow">YOUR WORDS, WHEREVER YOU GO</div>
        <h1>
          {mode === "signup"
            ? "Start your wordbook."
            : mode === "reset"
              ? "Reset your password."
              : "Welcome back."}
        </h1>
        {!supabase ? (
          <>
            <p>
              Cloud accounts aren’t configured yet. Add your Supabase project
              URL and publishable key to enable sign-in and sync.
            </p>
            <Link className="button" href="/add">
              Explore the local demo →
            </Link>
          </>
        ) : (
          <>
            <form onSubmit={submit}>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </label>
              {mode !== "reset" && (
                <label>
                  Password
                  <input
                    type="password"
                    name="password"
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    required
                  />
                </label>
              )}
              <button disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : "Sign in"}
              </button>
            </form>
            <div className="actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setMessage("");
                }}
              >
                {mode === "signup"
                  ? "Already have an account? Sign in"
                  : "Create an account"}
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setMode("reset");
                  setMessage("");
                }}
              >
                Forgot password?
              </button>
            </div>
          </>
        )}
        {message && (
          <p role="status" className="feedback">
            {message}
          </p>
        )}
      </section>
      <Link href="/">← Back to home</Link>
    </main>
  );
}

export default function Auth() {
  return (
    <Suspense
      fallback={
        <main className="auth">
          <p>Loading sign-in…</p>
        </main>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
