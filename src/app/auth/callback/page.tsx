"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { EmailOtpType } from "@supabase/supabase-js";
import { AppShell } from "@/components/ui/app-shell";
import { LoadingState } from "@/components/ui/states";

// Browser-side callback matches the app's existing localStorage session model.
// It also handles legacy implicit links whose fragments never reach a server route.
async function completeCallback(): Promise<string> {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  // Remove credentials from the address bar before any API call or navigation.
  window.history.replaceState(null, "", url.pathname);
  const failure = "/auth?error=auth_callback";
  if (
    !supabase ||
    url.searchParams.has("error") ||
    hash.has("error") ||
    url.searchParams.has("error_code") ||
    hash.has("error_code")
  )
    return failure;
  const type = url.searchParams.get("type") || hash.get("type");
  const destination =
    type === "recovery" || url.searchParams.get("next") === "/auth/reset"
      ? "/auth/reset"
      : "/library";
  try {
    const code = url.searchParams.get("code");
    const tokenHash = url.searchParams.get("token_hash");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    let result;
    if (code) {
      const flowId = url.searchParams.get("sb_flow_id");
      result = await supabase.auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
    } else if (
      tokenHash &&
      type &&
      ["email", "signup", "invite", "recovery", "email_change"].includes(type)
    ) {
      result = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });
    } else if (accessToken && refreshToken) {
      result = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } else return failure;
    if (result.error || !result.data.session) return failure;
    return destination;
  } catch {
    // Do not put provider errors or auth credentials into redirect URLs or logs.
    return failure;
  }
}

export default function AuthCallback() {
  const pending = useRef<Promise<string> | null>(null);
  useEffect(() => {
    let active = true;
    // Reuse the exchange during Strict Mode's effect replay: codes are single-use.
    if (!pending.current) pending.current = completeCallback();
    void pending.current.then((destination) => {
      if (active) window.location.replace(destination);
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <AppShell active="Profile" compact>
      <h1>Completing sign-in…</h1>
      <LoadingState label="Please wait while we confirm your email and open your wordbook." />
      <Link className="wb-inline-link" href="/auth">
        Back to sign in
      </Link>
    </AppShell>
  );
}
