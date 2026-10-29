"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";
import { DEMO_STORAGE_KEY, type LearningItem as Word } from "./learning";
function errorMessage(error: unknown, fallback: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "PGRST205"
  ) {
    return "Cloud storage is not set up yet. Run supabase/schema.sql in your Supabase SQL editor, then reload this page.";
  }
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : fallback;
}
const storageKey = DEMO_STORAGE_KEY;
export default function Workspace({
  page,
}: {
  page: "add" | "review" | "library";
}) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(false),
    [words, setWords] = useState<Word[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(""),
    [revealed, setRevealed] = useState<string | null>(null),
    [now, setNow] = useState(0),
    [editing, setEditing] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const accountId = useRef<string | null>(null);
  const load = useCallback(async (u: User | null) => {
    const version = ++loadVersion.current;
    setMessage("");
    setLoadError(false);
    try {
      if (supabase && u) {
        const { data, error } = await supabase
          .from("words")
          .select("*")
          .eq("user_id", u.id)
          .order("created_at", { ascending: false });
        if (version !== loadVersion.current) return;
        if (error) throw error;
        setWords(data || []);
      } else if (!supabase) {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (!Array.isArray(saved))
          throw new Error("Your local library could not be read.");
        setWords(saved);
      } else setWords([]);
    } catch (error) {
      if (version === loadVersion.current) {
        setWords([]);
        setLoadError(true);
        setMessage(errorMessage(error, "Could not load your library."));
      }
    } finally {
      if (version === loadVersion.current) setReady(true);
    }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const initial = setTimeout(() => {
      setNow(Date.now());
      setQuery(new URLSearchParams(window.location.search).get("q") || "");
      if (!supabase) void load(null);
    }, 0);
    if (!supabase)
      return () => {
        clearInterval(timer);
        clearTimeout(initial);
      };
    const client = supabase;
    void client.auth.getSession().then(({ data, error }) => {
      if (error) {
        setMessage(error.message);
        setReady(true);
        return;
      }
      accountId.current = data.session?.user.id || null;
      setUser(data.session?.user || null);
      void load(data.session?.user || null);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (accountId.current !== (session?.user.id || null)) {
        ++loadVersion.current;
        accountId.current = session?.user.id || null;
        setWords([]);
        setRevealed(null);
        setEditing(null);
        setReady(false);
      }
      setUser(session?.user || null);
      setTimeout(() => void load(session?.user || null), 0);
    });
    return () => {
      data.subscription.unsubscribe();
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, [load]);
  const persistLocal = (next: Word[]) => {
    localStorage.setItem(storageKey, JSON.stringify(next));
    setWords(next);
  };
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const form = e.currentTarget;
    const f = new FormData(form);
    const entry = {
      word: String(f.get("word")).trim(),
      meaning: String(f.get("meaning")).trim(),
      example: String(f.get("example")).trim(),
      due_at: new Date().toISOString(),
      interval_days: 0,
    };
    try {
      if (!entry.word || !entry.meaning)
        throw new Error("Enter a word and its meaning.");
      if (supabase) {
        if (!user) throw new Error("Please sign in first.");
        const { data, error } = await supabase
          .from("words")
          .insert({ ...entry, user_id: user.id })
          .select("*")
          .single();
        if (error) throw error;
        if (accountId.current !== user.id) return;
        setWords((previous) => [data, ...previous]);
      } else persistLocal([{ ...entry, id: crypto.randomUUID() }, ...words]);
      form.reset();
      setMessage("Word saved. Ready for your next review.");
    } catch (error) {
      setMessage(errorMessage(error, "Could not save word."));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    const owner = accountId.current;
    setBusy(true);
    setMessage("");
    try {
      if (supabase) {
        const { error } = await supabase
          .from("words")
          .delete()
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;
        if (accountId.current !== owner) return;
        setWords((previous) => previous.filter((w) => w.id !== id));
      } else persistLocal(words.filter((w) => w.id !== id));
    } catch (error) {
      setMessage(errorMessage(error, "Could not delete word."));
    } finally {
      setBusy(false);
    }
  }
  async function edit(e: React.FormEvent<HTMLFormElement>, word: Word) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const changes = {
      word: String(form.get("word")).trim(),
      meaning: String(form.get("meaning")).trim(),
      example: String(form.get("example")).trim(),
    };
    setBusy(true);
    setMessage("");
    try {
      if (!changes.word || !changes.meaning)
        throw new Error("Enter a word and its meaning.");
      let updated = { ...word, ...changes };
      if (supabase) {
        if (!user) throw new Error("Please sign in first.");
        const { data, error } = await supabase
          .from("words")
          .update(changes)
          .eq("id", word.id)
          .select("*")
          .single();
        if (error) throw error;
        if (accountId.current !== user.id) return;
        updated = data;
        setWords((previous) =>
          previous.map((item) => (item.id === word.id ? updated : item)),
        );
      } else
        persistLocal(
          words.map((item) => (item.id === word.id ? updated : item)),
        );
      setEditing(null);
      setMessage("Word updated.");
    } catch (error) {
      setMessage(errorMessage(error, "Could not update word."));
    } finally {
      setBusy(false);
    }
  }
  async function grade(word: Word, known: boolean) {
    const owner = accountId.current;
    setNow(Date.now());
    setBusy(true);
    setMessage("");
    const days = known ? Math.max(1, word.interval_days * 2) : 0;
    const updated = {
      ...word,
      interval_days: days,
      due_at: new Date(
        Date.now() + (known ? days * 86400000 : 600000),
      ).toISOString(),
    };
    try {
      if (supabase) {
        const { error } = await supabase
          .from("words")
          .update({ interval_days: days, due_at: updated.due_at })
          .eq("id", word.id)
          .select("id")
          .single();
        if (error) throw error;
        if (accountId.current !== owner) return;
        setWords((previous) =>
          previous.map((w) => (w.id === word.id ? updated : w)),
        );
      } else persistLocal(words.map((w) => (w.id === word.id ? updated : w)));
      setRevealed(null);
    } catch (error) {
      setMessage(errorMessage(error, "Could not save review."));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setWords([]);
    } catch (error) {
      setMessage(errorMessage(error, "Could not sign out. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  const due = words.filter((w) => new Date(w.due_at).getTime() <= now);
  const card = due[0];
  const [view, setView] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setView(new URLSearchParams(window.location.search).get("view") || ""),
      0,
    );
    return () => clearTimeout(timer);
  }, []);
  const visibleWords = words.filter((word) =>
    view === "new"
      ? word.interval_days === 0
      : view === "learning"
        ? word.interval_days > 0
        : true,
  );
  return (
    <div className="shell">
      <aside>
        <Link className="brand" href="/">
          wordbook<span>ENGLISH, EVERY DAY</span>
        </Link>
        <nav>
          {(["add", "review", "library"] as const).map((p, i) => (
            <Link
              aria-current={page === p ? "page" : undefined}
              className={page === p ? "active" : ""}
              href={"/" + p}
              key={p}
            >
              <span>0{i + 1}</span>
              {p[0].toUpperCase() + p.slice(1)}
              {p === "review" && <small>{due.length}</small>}
            </Link>
          ))}
        </nav>
        <div className="aside-bottom">
          <p>
            Small steps.
            <br />
            Lasting knowledge.
          </p>
          {user ? (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          ) : (
            <Link href="/auth">Sign in →</Link>
          )}
        </div>
      </aside>
      <main className="content">
        <header>
          <span>YOUR PERSONAL WORD SPACE</span>
          <span>
            {supabase ? user?.email || "Account required" : "LOCAL DEMO"}
          </span>
        </header>
        {!supabase && (
          <div className="notice">
            Demo mode · Words stay in this browser.{" "}
            <Link href="/auth">Connect an account</Link> once Supabase is
            configured.
          </div>
        )}
        <div className="page-title">
          <div className="eyebrow">MAKE A LITTLE PROGRESS TODAY</div>
          <h1>
            {page === "add"
              ? "A new word, a new possibility."
              : page === "review"
                ? "Let’s make it stick."
                : "Your growing vocabulary."}
          </h1>
          <p>
            {page === "add"
              ? "Save something worth remembering."
              : page === "review"
                ? "Take a moment to revisit the words you’re learning."
                : "Every word is another way to express yourself."}
          </p>
        </div>
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
        {!ready ? (
          <p role="status" aria-live="polite">
            Loading your library…
          </p>
        ) : supabase && !user ? (
          <section className="panel">
            <h2>Your words belong to you.</h2>
            <p>Sign in to access your private library.</p>
            <Link className="button" href="/auth">
              Sign in →
            </Link>
          </section>
        ) : loadError && page !== "add" ? (
          <section className="panel">
            <h2>Your library couldn’t be loaded.</h2>
            <p>
              Your saved words haven’t been removed. Check your connection and
              try again.
            </p>
            <button
              disabled={busy}
              onClick={() => {
                setReady(false);
                void load(user);
              }}
            >
              Try again
            </button>
          </section>
        ) : (
          <>
            {page === "add" && (
              <form className="panel word-form" onSubmit={add}>
                <label>
                  Word or phrase
                  <input
                    name="word"
                    placeholder="e.g. serendipity"
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Meaning
                  <textarea
                    name="meaning"
                    placeholder="What does it mean to you?"
                    required
                    maxLength={2000}
                  />
                </label>
                <label>
                  Example sentence <span className="muted">(optional)</span>
                  <textarea
                    name="example"
                    placeholder="Put your new word into context."
                    maxLength={3000}
                  />
                </label>
                <div className="form-bottom">
                  <span>One word today. More confidence tomorrow.</span>
                  <button disabled={busy}>
                    {busy ? "Saving…" : "Add to my library + "}
                  </button>
                </div>
              </form>
            )}
            {page === "library" && (
              <>
                <div className="library-tools">
                  <span>{visibleWords.length} words collected</span>
                  <input
                    aria-label="Search library"
                    placeholder="Search words or meanings…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {visibleWords
                  .filter((w) =>
                    (w.word + " " + w.meaning)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((w) => (
                    <article className="word-row" key={w.id}>
                      {editing === w.id ? (
                        <form
                          className="edit-form"
                          aria-label={"Edit " + w.word}
                          onSubmit={(e) => void edit(e, w)}
                        >
                          <label>
                            Word or phrase
                            <input
                              name="word"
                              defaultValue={w.word}
                              required
                              maxLength={120}
                            />
                          </label>
                          <label>
                            Meaning
                            <textarea
                              name="meaning"
                              defaultValue={w.meaning}
                              required
                              maxLength={2000}
                            />
                          </label>
                          <label>
                            Example sentence
                            <textarea
                              name="example"
                              defaultValue={w.example}
                              maxLength={3000}
                            />
                          </label>
                          <div className="actions">
                            <button disabled={busy}>Save changes</button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={busy}
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div>
                          <h2>{w.word}</h2>
                          <p>{w.meaning}</p>
                          {w.example && <blockquote>{w.example}</blockquote>}
                          <small>
                            Next review:{" "}
                            {new Date(w.due_at).toLocaleDateString()}
                          </small>
                        </div>
                      )}
                      <div className="word-actions">
                        <button
                          className="text-button"
                          disabled={busy || editing === w.id}
                          aria-label={"Edit " + w.word}
                          onClick={() => setEditing(w.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          aria-label={"Delete " + w.word}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete “" + w.word + "” from your library?",
                              )
                            )
                              void remove(w.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                {!visibleWords.length && (
                  <section className="panel">
                    <h2>Your next discovery starts here.</h2>
                    <p>Add your first word to begin building your library.</p>
                    <Link className="button" href="/add">
                      Add a word →
                    </Link>
                  </section>
                )}
                {visibleWords.length > 0 &&
                  !visibleWords.some((w) =>
                    (w.word + " " + w.meaning)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ) && <p>No matching words. Try another search.</p>}
              </>
            )}
            {page === "review" &&
              (card ? (
                <>
                  <p className="eyebrow">
                    {due.length} {due.length === 1 ? "WORD" : "WORDS"} READY TO
                    REVIEW
                  </p>
                  <section className="panel review-card">
                    <span className="eyebrow">
                      CAN YOU REMEMBER THE MEANING?
                    </span>
                    <h2>{card.word}</h2>
                    {revealed === card.id ? (
                      <>
                        <p>{card.meaning}</p>
                        {card.example && (
                          <blockquote>{card.example}</blockquote>
                        )}
                        <div className="actions">
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => void grade(card, false)}
                          >
                            Practice again · 10 min
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void grade(card, true)}
                          >
                            Got it · {Math.max(1, card.interval_days * 2)}{" "}
                            day(s)
                          </button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => setRevealed(card.id)}>
                        Reveal meaning
                      </button>
                    )}
                  </section>
                </>
              ) : (
                <section className="panel review-card">
                  <span className="eyebrow">A LITTLE PROGRESS, EVERY DAY</span>
                  <h2>
                    {words.length
                      ? "You’re all caught up."
                      : "Make room for your first word."}
                  </h2>
                  <p>
                    {words.length
                      ? "Come back when your next cards are due."
                      : "Add a word, then come here to practice recalling it."}
                  </p>
                  <Link className="button" href="/add">
                    Discover another word →
                  </Link>
                </section>
              ))}
          </>
        )}
      </main>
    </div>
  );
}
