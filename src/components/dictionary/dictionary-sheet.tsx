"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { DictionaryResult } from "@/lib/dictionary";
import { Pill, ArrowIcon } from "@/components/ui/primitives";
import { Feedback, LoadingState } from "@/components/ui/states";
import { HighlightWord } from "./highlight-word";
import { PronunciationControl } from "./pronunciation-control";
import { getPronunciations, rememberPronunciations } from "@/lib/pronunciation";
import styles from "./dictionary.module.css";
export function DictionaryButton({ word, meaning }: {
    word: string;
    meaning: string;
}) {
    const [open, setOpen] = useState(false);
    const dialogId = useId();
    return <><button type="button" className="secondary" aria-label={"Dictionary for " + word} aria-expanded={open} aria-controls={open ? dialogId : undefined} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>Dictionary <ArrowIcon /></button>{open && <DictionarySheet dialogId={dialogId} word={word} meaning={meaning} onClose={() => setOpen(false)}/>}</>;
}
function Pronunciation({ word, phonetics, showErrors = true, activeStyle = false }: { word: string; phonetics: DictionaryResult["phonetics"]; showErrors?: boolean; activeStyle?: boolean }) {
    return <div className={styles.pronunciation}>
        {(phonetics.length ? phonetics : [{ accent: "UK", text: "" }]).map(item => <PronunciationControl key={item.accent + item.audio} text={word}
            accent={item.accent === "US" ? "US" : "UK"} recording={item.audio || null}
            phonetic={item.text} showErrors={showErrors} activeStyle={activeStyle} />)}
    </div>;
}
export function WordPronunciation({ word }: { word: string }) {
    const [phonetics, setPhonetics] = useState<DictionaryResult["phonetics"] | null>(null);
    const anchor = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let active = true;
        const load = () => {
            observer?.disconnect();
            void getPronunciations(word).then(data => { if (active) setPhonetics(data); });
        };
        const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) load();
        }, { rootMargin: "180px 0px" }) : null;
        if (observer && anchor.current) observer.observe(anchor.current); else load();
        return () => { active = false; observer?.disconnect(); };
    }, [word]);
    return <div ref={anchor} className={styles.wordPronunciation}>{phonetics && <Pronunciation word={word} phonetics={phonetics} showErrors={false} />}</div>;
}
function DictionarySheet({ dialogId, word, meaning, onClose }: {
    dialogId: string;
    word: string;
    meaning: string;
    onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null), id = useId();
    const backdropPress = useRef(false);
    const outside = (x: number, y: number) => {
        const bounds = dialog.current?.getBoundingClientRect();
        return !!bounds && (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom);
    };
    const [synonymsOpen, setSynonymsOpen] = useState(false);
    const [result, setResult] = useState<DictionaryResult | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const element = dialog.current, previous = document.activeElement;
        element?.showModal();
        close.current?.focus();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { element?.close(); document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected)
            previous.focus({ preventScroll: true }); };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            try {
                const response = await fetch("/api/dictionary?" + new URLSearchParams({ word }), { signal: controller.signal });
                const data = await response.json();
                if (!response.ok)
                    throw new Error(typeof data.message === "string" ? data.message : "The dictionary is unavailable right now.");
                if (typeof data.word !== "string" || !Array.isArray(data.phonetics) || !Array.isArray(data.chinese) || !Array.isArray(data.english) || !Array.isArray(data.examples) || !Array.isArray(data.synonyms))
                    throw new Error("The dictionary returned an unreadable response.");
                if (!controller.signal.aborted) {
                    rememberPronunciations(word, data.phonetics);
                    setResult(data);
                }
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setError(e instanceof TypeError ? "The dictionary couldn’t be reached. Try again later." : e instanceof Error ? e.message : "The dictionary is unavailable.");
            }
        })();
        return () => controller.abort();
    }, [word, attempt]);
    return <dialog id={dialogId} ref={dialog} className={styles.sheet} aria-labelledby={id}
 onPointerDown={event => { backdropPress.current = outside(event.clientX, event.clientY); }}
 onClick={event => { const dismiss = backdropPress.current && outside(event.clientX, event.clientY); backdropPress.current = false; if (dismiss) onClose(); }}
 onCancel={e => { e.preventDefault(); onClose(); }}>
 <div className={styles.header}><span className={`${styles.kicker} wb-ui-text`}>DICTIONARY / REFERENCE</span><button ref={close} type="button" className={`wb-control wb-control-outline ${styles.close}`} aria-label="Close" title="Close dictionary" onClick={onClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
 <h2 id={id} className="wb-learning-content">{word}</h2>
 {result && <Pronunciation word={word} phonetics={result.phonetics} activeStyle/>}
 <aside className={styles.personal}><h3 className="wb-ui-text">My meaning</h3><p className="wb-learning-content">{meaning}</p></aside>
 {!result && !error && <LoadingState label="Looking up dictionary reference…"/>}
 {error && <div><Feedback>{error}</Feedback><button type="button" className="wb-control" onClick={() => { setError(""); setResult(null); setAttempt(v => v + 1); }}>Try again</button></div>}
 {result && <div className={styles.reference}>
 {result.chinese.length > 0 && <section><h3>Chinese</h3><ol className={styles.definitions}>{result.chinese.map((s, i) => <li key={i}><p lang="zh" className="wb-learning-content"><HighlightWord text={s} target={word} /></p></li>)}</ol></section>}
 {result.english.length > 0 && <section><h3>English</h3><ol className={styles.definitions}>{result.english.map((s, i) => <li key={i}>{s.partOfSpeech && <Pill className="wb-learning-content">{s.partOfSpeech}</Pill>}<p className="wb-learning-content"><HighlightWord text={s.definition} target={word} /></p></li>)}</ol></section>}
 {result.examples.length > 0 && <section><h3>Examples</h3>{result.examples.map((s, i) => <blockquote key={i} className="wb-learning-content">{s.source && <p><HighlightWord text={s.source} target={word} /></p>}{s.translation && <p lang="zh"><HighlightWord text={s.translation} target={word} /></p>}</blockquote>)}</section>}
 {result.synonyms.length > 0 && <details onToggle={event => setSynonymsOpen(event.currentTarget.open)}><summary className="wb-control wb-control-outline" data-selected={synonymsOpen || undefined}>Synonyms</summary><p className="wb-learning-content"><HighlightWord text={result.synonyms.join(" · ")} target={word} /></p></details>}
 {!result.chinese.length && !result.english.length && !result.examples.length && <p className="wb-ui-text">No definitions or examples available for this entry.</p>}
 <p className={`${styles.credit} wb-ui-text`}>Reference via UAPI. Your saved meaning stays yours.</p>
 </div>}
 </dialog>;
}
