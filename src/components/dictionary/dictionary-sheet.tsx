"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { DictionaryResult } from "@/lib/dictionary";
import { Pill } from "@/components/ui/primitives";
import { Feedback, LoadingState } from "@/components/ui/states";
import { PronunciationControl } from "./pronunciation-control";
import { getPronunciations } from "@/lib/pronunciation";
import styles from "./dictionary.module.css";
export function DictionaryButton({ word, meaning }: {
    word: string;
    meaning: string;
}) {
    const [open, setOpen] = useState(false);
    return <><button type="button" className="secondary" aria-label={"Dictionary for " + word} onClick={() => setOpen(true)}>Dictionary ↗</button>{open && <DictionarySheet word={word} meaning={meaning} onClose={() => setOpen(false)}/>}</>;
}
function Pronunciation({ word, phonetics, showErrors = true }: { word: string; phonetics: DictionaryResult["phonetics"]; showErrors?: boolean }) {
    return <div className={styles.pronunciation}>
        {(phonetics.length ? phonetics : [{ accent: "UK", text: "" }]).map(item => <PronunciationControl key={item.accent + item.audio} text={word}
            accent={item.accent === "US" ? "US" : "UK"} recording={item.audio || null}
            phonetic={item.text} showErrors={showErrors} />)}
    </div>;
}
export function WordPronunciation({ word }: { word: string }) {
    const [phonetics, setPhonetics] = useState<DictionaryResult["phonetics"] | null>(null);
    useEffect(() => {
        let active = true;
        void getPronunciations(word).then(data => { if (active) setPhonetics(data); });
        return () => { active = false; };
    }, [word]);
    return phonetics && <Pronunciation word={word} phonetics={phonetics} showErrors={false} />;
}
function DictionarySheet({ word, meaning, onClose }: {
    word: string;
    meaning: string;
    onClose: () => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null), id = useId();
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
                if (!controller.signal.aborted)
                    setResult(data);
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setError(e instanceof TypeError ? "The dictionary couldn’t be reached. Try again later." : e instanceof Error ? e.message : "The dictionary is unavailable.");
            }
        })();
        return () => controller.abort();
    }, [word, attempt]);
    return <dialog ref={dialog} className={styles.sheet} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
 <div className={styles.header}><Pill>DICTIONARY / REFERENCE</Pill><button ref={close} type="button" className="secondary" onClick={onClose}>Close</button></div>
 <h2 id={id}>{word}</h2>
 <aside className={styles.personal}><Pill>My meaning</Pill><p>{meaning}</p></aside>
 {!result && !error && <LoadingState label="Looking up dictionary reference…"/>}
 {error && <div><Feedback>{error}</Feedback><button type="button" onClick={() => { setError(""); setResult(null); setAttempt(v => v + 1); }}>Try again</button></div>}
 {result && <div className={styles.reference}>
 <Pronunciation word={word} phonetics={result.phonetics}/>
 {result.chinese.length > 0 && <section><h3>Chinese</h3>{result.chinese.map((s, i) => <p key={i} lang="zh">{s}</p>)}</section>}
 {result.english.length > 0 && <section><h3>English</h3>{result.english.map((s, i) => <div key={i}>{s.partOfSpeech && <Pill>{s.partOfSpeech}</Pill>}<p>{s.definition}</p></div>)}</section>}
 {result.examples.length > 0 && <section><h3>Examples</h3>{result.examples.map((s, i) => <blockquote key={i}>{s.source && <p>{s.source}</p>}{s.translation && <p lang="zh">{s.translation}</p>}</blockquote>)}</section>}
 {result.synonyms.length > 0 && <details><summary>Synonyms</summary><p>{result.synonyms.join(" · ")}</p></details>}
 {!result.chinese.length && !result.english.length && !result.examples.length && <p>No definitions or examples available for this entry.</p>}
 <p className={styles.credit}>Reference via UAPI. Your saved meaning stays yours.</p>
 </div>}
 </dialog>;
}
