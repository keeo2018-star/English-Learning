"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO_STORAGE_KEY, type LearningItem } from "@/lib/learning";
export function useHomeLibrary() {
  const [state, setState] = useState<{
    words: LearningItem[];
    loading: boolean;
    error: boolean;
    signedIn: boolean;
  }>({ words: [], loading: true, error: false, signedIn: false });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      version = 0;
    async function load(userId: string | null) {
      const request = ++version;
      try {
        let words: LearningItem[] = [];
        if (supabase && userId) {
          const { data, error } = await supabase
            .from("words")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          words = data || [];
        } else if (!supabase) {
          const data = JSON.parse(
            localStorage.getItem(DEMO_STORAGE_KEY) || "[]",
          );
          if (
            !Array.isArray(data) ||
            data.some(
              (item) =>
                !item ||
                typeof item.word !== "string" ||
                typeof item.interval_days !== "number",
            )
          )
            throw new Error("Invalid local library");
          words = data;
        }
        if (active && request === version)
          setState({ words, loading: false, error: false, signedIn: !!userId });
      } catch {
        if (active && request === version)
          setState({
            words: [],
            loading: false,
            error: true,
            signedIn: !!userId,
          });
      }
    }
    const initial = setTimeout(() => {
      if (!supabase) {
        void load(null);
        return;
      }
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) {
            if (active)
              setState({
                words: [],
                loading: false,
                error: true,
                signedIn: false,
              });
          } else void load(data.session?.user.id || null);
        })
        .catch(() => {
          if (active)
            setState({
              words: [],
              loading: false,
              error: true,
              signedIn: false,
            });
        });
    }, 0);
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      ++version;
      if (active)
        setState({
          words: [],
          loading: true,
          error: false,
          signedIn: !!session?.user,
        });
      setTimeout(() => {
        if (active) void load(session?.user.id || null);
      }, 0);
    });
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEMO_STORAGE_KEY && !supabase) void load(null);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      clearTimeout(initial);
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [revision]);
  return {
    ...state,
    retry: () => {
      setState((previous) => ({ ...previous, loading: true, error: false }));
      setRevision((v) => v + 1);
    },
  };
}
