"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { DictionaryResult } from "@/lib/dictionary";
import { Pill } from "@/components/ui/primitives";
import { Feedback, LoadingState } from "@/components/ui/states";
import styles from "./dictionary.module.css";
export function DictionaryButton({ word, meaning }: {
    word: string;
    meaning: string;
}) {
    const [open, setOpen] = useState(false);
    return <><button type="button" className="secondary" aria-label={"Dictionary for " + word} onClick={() => setOpen(true)}>Dictionary ↗</button>{open && <DictionarySheet word={word} meaning={meaning} onClose={() => setOpen(false)}/>}</>;
}
function AccentPronunciation({ item, showErrors }: { item: DictionaryResult["phonetics"][number]; showErrors: boolean }) {
    const player = useRef<HTMLAudioElement>(null);
    const [failed, setFailed] = useState(false);
    const [playing, setPlaying] = useState(false);
    useEffect(() => {
        const audio = player.current;
        if (!audio) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) {
                audio.preload = "auto";
                audio.load();
                observer.disconnect();
            }
        }, { rootMargin: "200px" });
        if (audio.parentElement) observer.observe(audio.parentElement);
        return () => { observer.disconnect(); audio.pause(); };
    }, []);
    async function play() {
        const audio = player.current;
        if (!audio) return;
        setFailed(false);
        setPlaying(true);
        try {
            if (audio.error) audio.load();
            audio.currentTime = 0;
            await audio.play();
        } catch {
            if (audio.isConnected) { setFailed(true); setPlaying(false); }
        }
    }
    return <span className={styles.phonetic}>
        <button type="button" className="secondary"
            aria-label={"Play pronunciation (" + item.accent + ")"}
            disabled={!item.audio || playing} onClick={() => void play()}>
            {item.accent} <span aria-hidden="true">{playing ? "…" : "▶"}</span>
        </button>
        {item.text && <span>{item.text}</span>}
        {item.audio && <audio ref={player} hidden preload="none" src={item.audio}
            onEnded={() => setPlaying(false)}
            onError={() => { setFailed(true); setPlaying(false); }} />}
        {failed && showErrors && <small role="status">Audio unavailable.</small>}
    </span>;
}
function Pronunciation({ phonetics, showErrors = true }: { phonetics: DictionaryResult["phonetics"]; showErrors?: boolean }) {
    return <div className={styles.pronunciation}>
        {phonetics.map(item => <AccentPronunciation key={item.accent + item.audio} item={item} showErrors={showErrors} />)}
    </div>;
}
export function WordPronunciation({ word }: { word: string }) {
    const [phonetics, setPhonetics] = useState<DictionaryResult["phonetics"]>([]);
    useEffect(() => {
        const controller = new AbortController();
        fetch("/api/dictionary?" + new URLSearchParams({ word, pronunciation: "1" }), { signal: controller.signal })
            .then(async response => {
                if (!response.ok) return;
                const data = await response.json();
                if (!controller.signal.aborted && Array.isArray(data.phonetics)) setPhonetics(data.phonetics);
            }).catch(() => { /* Reference availability never blocks a saved word. */ });
        return () => controller.abort();
    }, [word]);
    return <Pronunciation phonetics={phonetics} showErrors={false} />;
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
 <Pronunciation phonetics={result.phonetics}/>
 {result.chinese.length > 0 && <section><h3>Chinese</h3>{result.chinese.map((s, i) => <p key={i} lang="zh">{s}</p>)}</section>}
 {result.english.length > 0 && <section><h3>English</h3>{result.english.map((s, i) => <div key={i}>{s.partOfSpeech && <Pill>{s.partOfSpeech}</Pill>}<p>{s.definition}</p></div>)}</section>}
 {result.examples.length > 0 && <section><h3>Examples</h3>{result.examples.map((s, i) => <blockquote key={i}>{s.source && <p>{s.source}</p>}{s.translation && <p lang="zh">{s.translation}</p>}</blockquote>)}</section>}
 {result.synonyms.length > 0 && <details><summary>Synonyms</summary><p>{result.synonyms.join(" · ")}</p></details>}
 {!result.chinese.length && !result.english.length && !result.examples.length && <p>No definitions or examples available for this entry.</p>}
 <p className={styles.credit}>Reference via UAPI. Your saved meaning stays yours.</p>
 </div>}
 </dialog>;
}
