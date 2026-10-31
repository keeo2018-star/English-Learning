"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";
import { DEMO_STORAGE_KEY, type LearningItem as Word } from "./learning";
import { AppShell } from "@/components/ui/app-shell";
import {
  Card,
  Pill,
  collectionColor,
  ArrowIcon,
} from "@/components/ui/primitives";
import { LoadingState, StatePanel, Feedback } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddWordFlow } from "@/components/dictionary/add-word-flow";
import { DictionaryButton, WordPronunciation } from "@/components/dictionary/dictionary-sheet";
import { RandomPronunciation } from "@/components/dictionary/random-pronunciation";
type NewLearningItem = { word: string; meaning: string; example: string };
type SaveResult = "saved" | "failed";
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
    [randomIds, setRandomIds] = useState<string[] | null>(null),
    [randomPosition, setRandomPosition] = useState(0),
    [autoPronunciation, setAutoPronunciation] = useState(true),
    [now, setNow] = useState(0),
    [editing, setEditing] = useState<string | null>(null),
    [deleting, setDeleting] = useState<Word | null>(null);
  const loadVersion = useRef(0);
  const accountId = useRef<string | null>(null);
  const librarySearch = useRef<HTMLInputElement>(null);
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
        setRandomIds(null);
        setRandomPosition(0);
        setEditing(null);
        setDeleting(null);
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
  const saving = useRef(false);
  async function saveEntry(input: NewLearningItem): Promise<SaveResult> {
    if (saving.current) return "failed";
    saving.current = true;
    setBusy(true);
    setMessage("");
    const entry = {
      ...input,
      word: input.word.trim(),
      meaning: input.meaning.trim(),
      example: input.example.trim(),
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
        if (accountId.current !== user.id) return "failed";
        setWords((previous) => [data, ...previous]);
      } else persistLocal([{ ...entry, id: crypto.randomUUID() }, ...words]);
      setMessage("Word saved. Ready for your next review.");
      return "saved";
    } catch (error) {
      setMessage(errorMessage(error, "Could not save word."));
      return "failed";
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await saveEntry({
      word: String(values.get("word")),
      meaning: String(values.get("meaning")),
      example: "",
    });
    if (result === "saved") form.reset();
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
  const randomMode = randomIds !== null;
  const card = randomMode
    ? words.find(word => word.id === randomIds[randomPosition])
    : due[0];
  function startRandomReview() {
    const ids = words.map(word => word.id);
    for (let index = ids.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [ids[index], ids[other]] = [ids[other], ids[index]];
    }
    setRandomIds(ids);
    setRandomPosition(0);
    setRevealed(null);
    setMessage("");
  }
  function nextRandomWord() {
    setRevealed(null);
    setRandomPosition(position => position + 1);
  }
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
    <AppShell
      hideAddAction={page === "add"}
      active={
        page === "review" ? "Review" : page === "library" ? "Library" : null
      }
      account={
        user ? (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        ) : (
          <Link className="wb-control wb-control-outline" href="/auth">
            Sign in <ArrowIcon />
          </Link>
        )
      }
    >
      <div className="wb-workspace-meta">
        <Pill>
          {supabase ? user?.email || "Account required" : "LOCAL DEMO"}
        </Pill>
        <nav className="wb-workspace-tabs" aria-label="Learning navigation">
          {(["add", "review", "library"] as const).map((p, i) => (
            <Link
              key={p}
              href={"/" + p}
              aria-current={page === p ? "page" : undefined}
            >
              <span>0{i + 1}</span> {p[0].toUpperCase() + p.slice(1)}
              {p === "review" && <small>{due.length}</small>}
            </Link>
          ))}
        </nav>
      </div>
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
            ? "Find your next word."
            : page === "review"
              ? "Let’s make it stick."
              : "Your growing vocabulary."}
        </h1>
        <p>
          {page === "add"
            ? "Your words. Your meaning. Make it yours."
            : page === "review"
              ? "Take a moment to revisit the words you’re learning."
              : "Every word is another way to express yourself."}
        </p>
      </div>
      {message && <Feedback>{message}</Feedback>}
      {page === "add" ? (
        <AddWordFlow
          busy={busy}
          canSave={ready && (!supabase || !!user)}
          checkingAccount={!ready}
          onManualSubmit={add}
        />
      ) : !ready ? (
        <LoadingState />
      ) : supabase && !user ? (
        <StatePanel
          title="Your words belong to you."
          description="Sign in to access your private library."
          href="/auth"
          actionLabel="Sign in"
          color="lavender"
        />
      ) : loadError ? (
        <StatePanel
          title="Your library couldn’t be loaded."
          description="Your saved words haven’t been removed. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => {
            setReady(false);
            void load(user);
          }}
        />
      ) : (
        <>
          {page === "library" && (
            <>
              {view && (
                <Card
                  color={collectionColor(view)}
                  className="wb-collection-header"
                >
                  <Pill>YOUR COLLECTION VIEW</Pill>
                  <h2>
                    {view === "new"
                      ? "Fresh finds."
                      : view === "learning"
                        ? "In the making."
                        : "Your wordbook."}
                  </h2>
                  <p>{visibleWords.length} words in this view</p>
                  <Link href="/library" className="wb-inline-link">
                    All saved words <ArrowIcon />
                  </Link>
                </Card>
              )}
              <div className="library-tools">
                <Pill>
                  {visibleWords.length}{" "}
                  {visibleWords.length === 1 ? "word" : "words"} collected
                </Pill>
                <input
                  aria-label="Search library"
                  ref={librarySearch}
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
                  <Card
                    color={
                      w.interval_days === 0 ? "paper" : collectionColor(w.id)
                    }
                    className="word-row"
                    key={w.id}
                  >
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
                      <div className="wb-word-content">
                        <h2>{w.word}</h2>
                        <WordPronunciation key={w.word} word={w.word} />
                        <p>{w.meaning}</p>
                        {w.example && <blockquote>{w.example}</blockquote>}
                      </div>
                    )}
                    <div className="word-actions">
                      <DictionaryButton word={w.word} meaning={w.meaning} />
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
                        onClick={() => setDeleting(w)}
                      >
                        Delete
                      </button>
                    </div>
                  </Card>
                ))}
              {!visibleWords.length && (
                <StatePanel
                  title="Your next discovery starts here."
                  description="Add your first word to begin building your library."
                  href="/add"
                  actionLabel="Add a word"
                  color="lavender"
                />
              )}
              {visibleWords.length > 0 &&
                !visibleWords.some((w) =>
                  (w.word + " " + w.meaning)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                ) && (
                  <StatePanel
                    title="Try a different word."
                    description="No matching words. Try another search."
                  />
                )}
            </>
          )}
          {page === "review" && words.length > 0 && (
            <div className="review-modes" role="group" aria-label="Review mode">
              <button type="button" className={!randomMode ? "" : "secondary"}
                aria-pressed={!randomMode} disabled={busy}
                onClick={() => { setRandomIds(null); setRevealed(null); setMessage(""); }}>
                Due words
              </button>
              <button type="button" className={randomMode ? "" : "secondary"}
                aria-pressed={randomMode} disabled={busy}
                onClick={() => { if (!randomMode) startRandomReview(); }}>
                Random review
              </button>
            </div>
          )}
          {page === "review" && words.length > 0 && (
            <label className="review-auto-pronunciation">
              <input type="checkbox" checked={autoPronunciation}
                onChange={event => setAutoPronunciation(event.target.checked)} />
              Auto pronunciation
            </label>
          )}
          {page === "review" &&
            (card ? (
              <>
                <p className="eyebrow" role="status">
                  {randomMode
                    ? `RANDOM REVIEW · ${randomPosition + 1} OF ${randomIds.length}`
                    : `${due.length} ${due.length === 1 ? "WORD" : "WORDS"} READY TO REVIEW`}
                </p>
                <Card
                  key={card.id}
                  color={collectionColor(card.id)}
                  className="panel review-card"
                >
                  <h2>{card.word}</h2>
                  {randomMode
                    ? <RandomPronunciation text={card.word} automatic={autoPronunciation} />
                    : <WordPronunciation key={card.word} word={card.word} />}
                  {revealed === card.id ? (
                    <>
                      <p className="wb-meaning-reveal">{card.meaning}</p>
                      <DictionaryButton word={card.word} meaning={card.meaning} />
                      {card.example && <blockquote>{card.example}</blockquote>}
                      {randomMode ? (
                        <div className="actions">
                          <button type="button" onClick={nextRandomWord}>
                            {randomPosition + 1 === randomIds.length ? "Finish review" : "Next word"}
                          </button>
                        </div>
                      ) : <div className="actions">
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
                          Got it · {Math.max(1, card.interval_days * 2)} day(s)
                        </button>
                      </div>}
                    </>
                  ) : (
                    <button className="review-reveal" onClick={() => setRevealed(card.id)}>
                      Reveal meaning
                    </button>
                  )}
                </Card>
              </>
            ) : (
              <div className="review-card">
                {randomMode ? <StatePanel
                  title="Random review complete."
                  description={`You revisited ${randomIds.length} ${randomIds.length === 1 ? "word" : "words"}. Your review schedule is unchanged.`}
                  actionLabel="Shuffle again"
                  onAction={startRandomReview}
                  color="green"
                  completed
                /> : <StatePanel
                  title={
                    words.length
                      ? "You’re all caught up."
                      : "Make room for your first word."
                  }
                  description={
                    words.length
                      ? "Come back when your next cards are due."
                      : "Add a word, then come here to practice recalling it."
                  }
                  href="/add"
                  actionLabel="Discover another word"
                  color={words.length ? "green" : "paper"}
                  completed={words.length > 0}
                />}
              </div>
            ))}
        </>
      )}
      {deleting && (
        <ConfirmDialog
          word={deleting.word}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await remove(deleting.id);
            setDeleting(null);
            requestAnimationFrame(() => librarySearch.current?.focus());
          }}
        />
      )}
    </AppShell>
  );
}
