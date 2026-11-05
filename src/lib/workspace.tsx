"use client";
import { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";
import { DEMO_STORAGE_KEY, itemType, type LearningItem as Word } from "./learning";
import { AppShell } from "@/components/ui/app-shell";
import {
  Card,
  Pill,
  collectionColor,
  ArrowIcon,
} from "@/components/ui/primitives";
import { LoadingState, StatePanel, Feedback } from "@/components/ui/states";
import { SelectableLink, SelectableButton, SelectableToggle } from "@/components/ui/selection";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddWordFlow } from "@/components/dictionary/add-word-flow";
import { DictionaryButton, WordPronunciation } from "@/components/dictionary/dictionary-sheet";
import { contextPrompt, createReviewQueue, rateItem, reviewState, type RecallRating } from "./review";
import { preloadPronunciation, prepareReviewPronunciation, stopPronunciation } from "./pronunciation";
import { ReviewPronunciation } from "@/components/dictionary/review-pronunciation";
import { completeSessionCard, newReviewSession, readReviewSession, reviewSessionKey, type ReviewSession } from "./review-session";
import { DEMO_EVENTS_KEY } from "@/components/learning/learning-calendar";
import { indexLibrary, normalizeLibraryQuery, LIBRARY_PAGE_SIZE } from "./library-search";
type NewLearningItem = { word: string; meaning: string; example: string; item_type?: "word" | "expression" | null };
type SaveResult = "saved" | "failed";
function errorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "code" in error && error.code === "PGRST204" && "message" in error && String(error.message).includes("item_type"))
    return "Content types aren’t available yet. Keep Automatic for now, or try again once learning activity is enabled.";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const randomMode = page === "review" && searchParams.get("mode") === "random";
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState(false),
    [words, setWords] = useState<Word[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(() => searchParams.get("q") || ""),
    [libraryPage, setLibraryPage] = useState(0),
    [syncError, setSyncError] = useState(false),
    [revealed, setRevealed] = useState<string | null>(null),
    [session, setSession] = useState<ReviewSession | null>(null),
    [typeFilter, setTypeFilter] = useState<"all" | "word" | "expression">("all"),
    [autoPronunciation, setAutoPronunciation] = useState(true),
    [pendingRating, setPendingRating] = useState<RecallRating | null>(null),
    [now, setNow] = useState(0),
    [editing, setEditing] = useState<string | null>(null),
    [deleting, setDeleting] = useState<Word | null>(null);
  const requestedRandom = useRef(false);
  const saving = useRef(false);
  const ratingInFlight = useRef(false);
  const loadVersion = useRef(0);
  const accountId = useRef<string | null>(null);
  const librarySearch = useRef<HTMLInputElement>(null);
  const libraryResults = useRef<HTMLDivElement>(null);
  const revealButton = useRef<HTMLButtonElement>(null);
  const focusNextCard = useRef(false);
  const load = useCallback(async (u: User | null, background = false) => {
    if (supabase && (u?.id || null) !== accountId.current) return;
    const version = ++loadVersion.current;
    if (!background) { setMessage(""); setLoadError(false); }
    try {
      if (supabase && u) {
        const all: Word[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from("words").select("*").eq("user_id", u.id)
            .order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
          if (version !== loadVersion.current) return;
          if (error) throw error;
          all.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        setWords(all);
      } else if (!supabase) {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (!Array.isArray(saved))
          throw new Error("Your local library could not be read.");
        setWords(saved);
      } else setWords([]);
      if (version === loadVersion.current) { setSyncError(false); setLoadError(false); }
    } catch (error) {
      if (version === loadVersion.current && background) { setSyncError(true); }
      else if (version === loadVersion.current) {
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
        setSession(null);
        requestedRandom.current = false;

        setEditing(null);
        setDeleting(null);
        setLibraryPage(0);
        setSyncError(false);
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
  useEffect(() => {
    if (!ready || (supabase && !user)) return;
    const refresh = () => { if (document.visibilityState === "visible" && !ratingInFlight.current && !saving.current && !editing) { void load(user, true); } };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(refresh, 30000);
    const client = supabase;
    const channel = client && user ? client.channel(`library:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "words", filter: `user_id=eq.${user.id}` }, refresh).subscribe() : null;
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); if (channel && client) void client.removeChannel(channel); };
  }, [ready, user, load, editing]);
  const account = user?.id || "local-demo";
  const persistSession = useCallback((next: ReviewSession) => {
    try { localStorage.setItem(reviewSessionKey(next.account), JSON.stringify(next)); } catch { /* An in-memory session still works when storage is restricted. */ }
    setSession(next);
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === reviewSessionKey(account)) setSession(readReviewSession(event.newValue, account));
      if (!supabase && event.key === storageKey) void load(null);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [account, load]);
  const persistLocal = (next: Word[]) => {
    localStorage.setItem(storageKey, JSON.stringify(next));
    setWords(next);
  };
  async function saveEntry(input: NewLearningItem): Promise<SaveResult> {
    if (saving.current) return "failed";
    saving.current = true;
    setBusy(true);
    setMessage("");
    const { item_type, ...content } = input;
    const entry = {
      ...content,
      ...(item_type ? { item_type } : {}),
      word: input.word.trim(),
      meaning: input.meaning.trim(),
      example: input.example.trim(),
      due_at: new Date().toISOString(),
      interval_days: 0,
      created_at: new Date().toISOString(),
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
      item_type: values.get("item_type") === "auto" ? null : String(values.get("item_type")) as "word" | "expression",
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
  async function saveDictionaryMeaning(word: Word, value: string) {
    const meaning = value.trim();
    if (!meaning || meaning.length > 2000) throw new Error("Enter a meaning between 1 and 2,000 characters.");
    if (saving.current) throw new Error("A save is already in progress. Please try again.");
    saving.current = true;
    ++loadVersion.current;
    setBusy(true); setMessage("");
    try {
      if (supabase) {
        if (!user) throw new Error("Please sign in first.");
        const { data, error } = await supabase.from("words").update({ meaning }).eq("id", word.id).eq("user_id", user.id).select("*").single();
        if (error) throw new Error(errorMessage(error, "Could not save your meaning. Please try again."));
        if (accountId.current !== user.id) throw new Error("Your account changed. Please reopen the item.");
        setWords(previous => previous.map(item => item.id === word.id ? data : item));
      } else persistLocal(words.map(item => item.id === word.id ? { ...item, meaning } : item));
      setMessage("Meaning updated.");
    } finally { saving.current = false; setBusy(false); }
  }
  async function edit(e: React.FormEvent<HTMLFormElement>, word: Word) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const changes = {
      word: String(form.get("word")).trim(),
      meaning: String(form.get("meaning")).trim(),
      example: String(form.get("example")).trim(),
      ...(word.item_type !== undefined || String(form.get("item_type")) !== itemType(word)
        ? { item_type: String(form.get("item_type")) as "word" | "expression" } : {}),
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
  async function grade(word: Word, rating: RecallRating) {
    if (ratingInFlight.current) return;
    ratingInFlight.current = true;
    setPendingRating(rating);
    const owner = accountId.current;
    setNow(Date.now());
    setBusy(true);
    setMessage("");
    let updated = rateItem(word, rating);
    const currentSession = randomMode ? session : null;
    const entry = currentSession?.queue.find(c => c.id === word.id && !currentSession.completed.includes(c.eventId));
    const attemptKey = `noted-due-attempt-v1:${account}:${word.id}:${reviewState(word)?.review_count ?? 0}`;
    let eventId = entry?.eventId;
    if (!eventId) {
      try { eventId = localStorage.getItem(attemptKey) || undefined; } catch { /* Storage may be restricted. */ }
      eventId ||= crypto.randomUUID();
      try { localStorage.setItem(attemptKey, eventId); } catch { /* The in-flight guard still prevents double taps. */ }
    }
    try {
      if (supabase) {
        if (!user) throw new Error("Please sign in first.");
        let { data, error } = await supabase.rpc("record_learning_review", {
          p_event_id: eventId, p_item_id: word.id, p_rating: rating === "sure" ? "sure" : "not_sure",
          p_expected_count: reviewState(word)?.review_count ?? 0,
          p_due_at: updated.due_at, p_interval_days: updated.interval_days, p_review_state: updated.review_state,
        });
        if (error?.code === "PGRST202" || error?.code === "PGRST205") {
          // Additive rollout: an unapplied migration must not disable existing reviews.
          // Do not invent an event or calendar zero for this compatibility save.
          const legacy = await supabase.from("words")
            .update({ interval_days: updated.interval_days, due_at: updated.due_at, review_state: updated.review_state })
            .eq("id", word.id).select("*").single();
          data = legacy.data; error = legacy.error;
          if (!error && accountId.current === owner) setMessage("Review saved. Activity tracking isn’t available yet.");
        }
        if (error) throw error;
        if (accountId.current !== owner) return;
        updated = data as Word;
        if (!updated?.id || updated.id !== word.id) throw new Error("Could not confirm the saved review. Please retry.");
        setWords(previous => previous.map(w => w.id === word.id ? updated : w));
      } else {
        const events = JSON.parse(localStorage.getItem(DEMO_EVENTS_KEY) || "[]");
        if (!events.some((e: { id: string }) => e.id === eventId)) {
          events.push({ id: eventId, learning_item_id: word.id, reviewed_at: new Date().toISOString(), familiarity_rating: rating === "sure" ? "sure" : "not_sure" });
          localStorage.setItem(DEMO_EVENTS_KEY, JSON.stringify(events));
          persistLocal(words.map(w => w.id === word.id ? updated : w));
        }
      }
      focusNextCard.current = true;
      setRevealed(null);
      if (currentSession && entry) {
        let latest: ReviewSession | null = null;
        try { latest = readReviewSession(localStorage.getItem(reviewSessionKey(account)), account); } catch { /* In-memory sessions remain usable. */ }
        if (latest && latest.id !== currentSession.id) setSession(latest);
        else persistSession(completeSessionCard(latest || currentSession, entry.eventId));
      }
    } catch (error) {
      setMessage(errorMessage(error, "Could not save review. Please try again."));
    } finally {
      ratingInFlight.current = false;
      setPendingRating(null);
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
  const due = useMemo(() => words.filter((w) => new Date(w.due_at).getTime() <= now), [words, now]);
  const randomQueue = session?.queue ?? null;
  const randomPosition = session ? session.queue.findIndex(entry => !session.completed.includes(entry.eventId) && words.some(word => word.id === entry.id)) : 0;
  const reviewCard = randomPosition >= 0 ? randomQueue?.[randomPosition] : undefined;
  const sessionTotal = session?.queue.filter(entry => session.completed.includes(entry.eventId) || words.some(word => word.id === entry.id)).length ?? 0;
  const reviewedCount = session?.completed.length ?? 0;
  const card = randomMode ? words.find(word => word.id === reviewCard?.id) : due[0];
  const direction = randomMode ? reviewCard?.direction ?? "forward" : "forward";
  const prompt = card ? direction === "context" ? contextPrompt(card) || card.word : direction === "reverse" ? card.meaning : card.word : "";
  useEffect(() => {
    if (focusNextCard.current) {
      revealButton.current?.focus({ preventScroll: true });
      focusNextCard.current = false;
    }
  }, [card?.id, randomPosition]);
  function startRandomReview() {
    const queue = createReviewQueue(words);
    for (const entry of queue.slice(0, 2)) {
      const word = words.find(item => item.id === entry.id);
      if (word) void preloadPronunciation(word.word);
    }
    persistSession(newReviewSession(account, queue));
    setRevealed(null);
    setMessage("");
  }
  useEffect(() => {
    if (!randomMode) { requestedRandom.current = false; return; }
    if (ready && (!supabase || user) && !loadError && words.length && !requestedRandom.current) {
      requestedRandom.current = true;
      let restored: ReviewSession | null = null;
      try { restored = readReviewSession(localStorage.getItem(reviewSessionKey(account)), account); } catch { /* Restricted storage. */ }
      if (restored) setSession(restored); else persistSession(newReviewSession(account, createReviewQueue(words)));
    }
  }, [randomMode, ready, user, loadError, words, account, persistSession]);
  useEffect(() => {
    if (page !== "review") return;
    if (card) void preloadPronunciation(card.word);
    if (randomMode) {
      for (const entry of randomQueue?.filter(entry => !session?.completed.includes(entry.eventId) && entry.id !== card?.id).slice(0, 2) ?? []) {
        const candidate = words.find(word => word.id === entry.id);
        if (candidate) void preloadPronunciation(candidate.word);
      }
    } else {
      for (const candidate of due.slice(1, 3)) void preloadPronunciation(candidate.word);
    }
  }, [page, randomMode, card, randomQueue, randomPosition, words, due, session?.completed]);
  const [view, setView] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setView(new URLSearchParams(window.location.search).get("view") || ""),
      0,
    );
    return () => clearTimeout(timer);
  }, []);
  const deferredQuery = useDeferredValue(query);
  const searchPending = query !== deferredQuery;
  const libraryIndex = useMemo(() => indexLibrary(page === "library" ? words : []), [page, words]);
  const visibleEntries = useMemo(() => libraryIndex.filter(entry =>
    (typeFilter === "all" || entry.type === typeFilter) &&
    (view === "new" ? entry.word.interval_days === 0 : view === "learning" ? entry.word.interval_days > 0 : true)), [libraryIndex, typeFilter, view]);
  const matchingWords = useMemo(() => {
    const term = normalizeLibraryQuery(deferredQuery);
    return visibleEntries.filter(entry => !term || entry.text.includes(term)).map(entry => entry.word);
  }, [visibleEntries, deferredQuery]);
  const wordCount = useMemo(() => libraryIndex.filter(entry => entry.type === "word").length, [libraryIndex]);
  const visibleWords = visibleEntries;
  const currentPage = Math.min(libraryPage, Math.max(0, Math.ceil(matchingWords.length / LIBRARY_PAGE_SIZE) - 1));
  const pageStart = currentPage * LIBRARY_PAGE_SIZE;
  const displayedWords = matchingWords.slice(pageStart, pageStart + LIBRARY_PAGE_SIZE);
  function changeLibraryPage(next: number) {
    setLibraryPage(next);
    libraryResults.current?.scrollIntoView({ block: "start" });
    libraryResults.current?.focus({ preventScroll: true });
  }
  return (
    <AppShell
      hideAddAction={page === "add"}
      active={
        page === "review" || page === "library" ? "Review" : page === "add" ? "Add" : null
      }
      account={
        user ? (
          <button
            className="text-button"
            data-rating-lock={pendingRating !== null || undefined}
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
      {page !== "add" && (
        <nav className="review-modes" aria-label="Learning navigation" data-saving={pendingRating !== null || undefined}>
          {page === "review" ? <>
            <SelectableButton className="secondary" selected={!randomMode} disabled={busy}
              onClick={() => { if (!randomMode) { prepareReviewPronunciation(); return; } stopPronunciation(); prepareReviewPronunciation(); setRevealed(null); setMessage(""); router.replace("/review", { scroll: false }); }}>
              Due words
            </SelectableButton>
            <SelectableButton className="secondary" selected={randomMode} disabled={busy || !ready || !!loadError || (!!supabase && !user) || !words.length}
              onClick={() => { if (!randomMode) { stopPronunciation(); prepareReviewPronunciation(); setSession(null); setRevealed(null); router.replace("/review?mode=random", { scroll: false }); } }}>
              Random review
            </SelectableButton>
          </> : <>
            <SelectableLink className="wb-control wb-control-outline" selected={false} href="/review" onClick={() => { stopPronunciation(); prepareReviewPronunciation(); }}>Due words</SelectableLink>
            <SelectableLink className="wb-control wb-control-outline" selected={false} href="/review?mode=random" onClick={() => { stopPronunciation(); prepareReviewPronunciation(); }}>Random review</SelectableLink>
          </>}
          <SelectableLink className="wb-control wb-control-outline" selected={page === "library"} href="/library"
            aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); else stopPronunciation(); }}>Library</SelectableLink>
        </nav>
      )}
      {message && <Feedback>{message}</Feedback>}
      {syncError && <Feedback>Could not refresh. Showing your last loaded items. <button type="button" className="text-button" onClick={() => void load(user, true)}>Retry sync</button></Feedback>}
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
              <div className="library-metadata wb-ui-text">
                <p role="status" aria-label="Library count">{searchPending ? "Searching…" : deferredQuery.trim() ? `${matchingWords.length} ${matchingWords.length === 1 ? "result" : "results"} · ${words.length} total items` : `${visibleWords.length} ${visibleWords.length === 1 ? "item" : "items"}`}</p>
                <span>Words: {wordCount} · Expressions: {words.length - wordCount}</span>
              </div>
              <div className="library-filters" role="group" aria-label="Library content type">
                {([['all', 'All'], ['word', 'Words'], ['expression', 'Expressions']] as const).map(([type, label]) => <SelectableButton key={type} className="secondary" selected={typeFilter === type} onClick={() => { setTypeFilter(type); setLibraryPage(0); }}>{label}</SelectableButton>)}
              </div>
              <div className="library-tools">
                <input
                  aria-label="Search library"
                  ref={librarySearch}
                  placeholder="Search words or meanings…"
                  defaultValue={query}
                  onChange={(e) => { const value = e.target.value; startTransition(() => { setQuery(value); setLibraryPage(0); }); }}
                />
              </div>
              <div ref={libraryResults} tabIndex={-1} role="region" className="library-results" aria-label="Library results" aria-busy={searchPending}>
              {displayedWords.map((w) => (
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
                        <label>Content type
                          <select name="item_type" defaultValue={itemType(w)}><option value="word">Word</option><option value="expression">Expression</option></select>
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
                        <h2 className="wb-learning-content">{w.word}</h2>
                        <WordPronunciation key={w.word} word={w.word} />
                        <p className="wb-learning-content">{w.meaning}</p>
                        {reviewState(w) && <span className="wb-familiarity wb-ui-text">{reviewState(w)?.last_rating === "sure" ? "Sure" : "Not sure"}</span>}
                        {w.example && <blockquote className="wb-learning-content">{w.example}</blockquote>}
                      </div>
                    )}
                    <div className="word-actions">
                      <DictionaryButton word={w.word} meaning={w.meaning} onSaveMeaning={value => saveDictionaryMeaning(w, value)} />
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
              </div>
              {matchingWords.length > LIBRARY_PAGE_SIZE && <nav className="library-pagination wb-ui-text" aria-label="Library pages">
                <button type="button" className="secondary" disabled={currentPage === 0 || searchPending || !!editing} onClick={() => changeLibraryPage(currentPage - 1)}>Previous</button>
                <span role="status">{pageStart + 1}–{Math.min(pageStart + LIBRARY_PAGE_SIZE, matchingWords.length)} of {matchingWords.length}</span>
                <button type="button" className="secondary" disabled={pageStart + LIBRARY_PAGE_SIZE >= matchingWords.length || searchPending || !!editing} onClick={() => changeLibraryPage(currentPage + 1)}>Next</button>
              </nav>}
              {!visibleWords.length && (
                <StatePanel
                  title={words.length ? "No items in this view." : "Your next discovery starts here."}
                  description={words.length ? "Choose another filter, or add something new." : "Add your first word to begin building your library."}
                  href="/add"
                  actionLabel="Add a word"
                  color="lavender"
                />
              )}
              {visibleWords.length > 0 && !matchingWords.length && (
                  <StatePanel
                    title="Try a different word."
                    description="No matching words. Try another search."
                  />
                )}
            </>
          )}
          {page === "review" && words.length > 0 && (
            <SelectableToggle className="review-auto-pronunciation" checked={autoPronunciation}
              onChange={event => { if (event.target.checked) prepareReviewPronunciation(); setAutoPronunciation(event.target.checked); }}>
              Auto pronunciation
            </SelectableToggle>
          )}
          {page === "review" &&
            (randomMode && randomQueue === null && words.length > 0 ? <LoadingState label="Opening review…" /> : card ? (
              <>
                {randomMode ? <div className="review-progress wb-ui-text">
                  <span role="status" aria-label="Session progress">{reviewedCount} / {sessionTotal}</span>
                  <progress aria-label="Items reviewed" value={reviewedCount} max={Math.max(1, sessionTotal)} />
                </div> : <p className="eyebrow" role="status">{due.length} {due.length === 1 ? "WORD" : "WORDS"} READY TO REVIEW</p>}
                <Card
                  key={`${card.id}/${randomMode ? `${session?.id}/${randomPosition}` : "due"}`}
                  color={collectionColor(card.id)}
                  className="panel review-card"
                >
                  <h2 className="wb-learning-content">{prompt}</h2>
                  {(!randomMode || direction === "forward" || revealed === card.id) && <ReviewPronunciation text={card.word} automatic={autoPronunciation} />}
                  {revealed === card.id ? (
                    <>
                      <p className="wb-meaning-reveal wb-learning-content">{direction === "forward" ? card.meaning : card.word}</p>
                      <DictionaryButton word={card.word} meaning={card.meaning} onSaveMeaning={value => saveDictionaryMeaning(card, value)} />
                      {direction === "context" && <p className="wb-learning-content">{card.meaning}</p>}
                      {card.example && <blockquote className="wb-learning-content">{card.example}</blockquote>}
                      <div className="actions review-ratings" role="group" aria-label="How well did you recall it?">
                        <SelectableButton selected={pendingRating === "unsure"} className="secondary" disabled={busy}
                          onClick={() => void grade(card, "unsure")}>Not sure</SelectableButton>
                        <SelectableButton selected={pendingRating === "sure"} disabled={busy}
                          onClick={() => void grade(card, "sure")}>Sure</SelectableButton>
                      </div>
                    </>
                  ) : (
                    <button ref={revealButton} className="review-reveal" onClick={() => setRevealed(card.id)}>
                      Reveal answer
                    </button>
                  )}
                </Card>
              </>
            ) : (
              <div className="review-card">
                {randomMode ? <section className="review-completion wb-ui-text">
                  <h2>Review complete.</h2>
                  <p>{reviewedCount} {reviewedCount === 1 ? "item" : "items"} reviewed.</p>
                  <button type="button" onClick={() => { prepareReviewPronunciation(); startRandomReview(); }}>Start another review</button>
                </section> : <StatePanel
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
