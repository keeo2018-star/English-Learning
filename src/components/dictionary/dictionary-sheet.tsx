"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { DictionaryResult } from "@/lib/dictionary";
import { Pill, ArrowIcon } from "@/components/ui/primitives";
import { Feedback, LoadingState } from "@/components/ui/states";
import { HighlightWord } from "./highlight-word";
import { PronunciationControl } from "./pronunciation-control";
import { getPronunciations, rememberPronunciations } from "@/lib/pronunciation";
import styles from "./dictionary.module.css";
import {dictionaryReference} from '@/lib/dictionary-client';
import { RelatedWords,type RelatedInput } from './related-words';
import {stopPronunciation} from '@/lib/pronunciation';
import { VideoContextSection } from './video-context-section';
export function DictionaryButton({ word, meaning, onSaveMeaning,onRelatedSave,savedWords }: {
    onRelatedSave?:(input:RelatedInput)=>Promise<void>;savedWords?:string[];
    onSaveMeaning?: (meaning: string) => Promise<void>;
    word: string;
    meaning: string;
}) {
    const [open, setOpen] = useState(false);
    const dialogId = useId();
    return <><button type="button" className="secondary" aria-label={"Dictionary for " + word} aria-expanded={open} aria-controls={open ? dialogId : undefined} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>Dictionary <ArrowIcon /></button>{open && <DictionarySheet dialogId={dialogId} word={word} meaning={meaning} onSaveMeaning={onSaveMeaning} onRelatedSave={onRelatedSave} savedWords={savedWords} onClose={() => setOpen(false)}/>}</>;
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
function DictionarySheet({ dialogId, word:rootWord, meaning:rootMeaning, onSaveMeaning:rootSaveMeaning, onClose,onRelatedSave,savedWords }: {
    onRelatedSave?:(input:RelatedInput)=>Promise<void>;savedWords?:string[];
    onSaveMeaning?: (meaning: string) => Promise<void>;
    dialogId: string;
    word: string;
    meaning: string;
    onClose: () => void;
}) {
    const [trail,setTrail]=useState<{word:string;scroll:number}[]>([]);
    const word=trail.at(-1)?.word||rootWord,meaning=trail.length?'':rootMeaning,onSaveMeaning=trail.length?undefined:rootSaveMeaning;
    const dialog = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null), id = useId();
    const backdropPress = useRef(false),restoreScroll=useRef(0);
    const savingMeaning = useRef(false);
    const meaningInput = useRef<HTMLTextAreaElement>(null);
    const editButton = useRef<HTMLButtonElement>(null);
    const [editingMeaning, setEditingMeaning] = useState(false), [draft, setDraft] = useState(meaning),
        [meaningBusy, setMeaningBusy] = useState(false), [meaningError, setMeaningError] = useState(""), [meaningSaved, setMeaningSaved] = useState(false);
    async function saveMeaning(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!onSaveMeaning || savingMeaning.current) return;
        const value = draft.trim();
        if (!value) { setMeaningError("Enter your meaning before saving."); return; }
        savingMeaning.current = true; setMeaningBusy(true); setMeaningError("");
        try { await onSaveMeaning(value); setMeaningSaved(true); setEditingMeaning(false); requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true })); }
        catch (error) { setMeaningError(error instanceof Error ? error.message : "Could not save your meaning. Please try again."); }
        finally { savingMeaning.current = false; setMeaningBusy(false); }
    }
    function requestClose() {
        if (savingMeaning.current) return;
        if (editingMeaning && draft !== meaning) { setMeaningError("Save or cancel your edit before closing."); meaningInput.current?.focus(); return; }
        onClose();
    }
    useEffect(() => { if (editingMeaning) meaningInput.current?.focus(); }, [editingMeaning]);
    useEffect(() => {
        const element = dialog.current;
        if (!element) return;
        let start: { x: number; y: number; distance: number; handle: boolean } | null = null;
        const reset = () => { start = null; element.removeAttribute("data-dragging"); element.style.removeProperty("--dictionary-drag-y"); };
        const begin = (event: TouchEvent) => {
            reset();
            if (!window.matchMedia("(max-width: 699px)").matches || editingMeaning || savingMeaning.current || event.touches.length !== 1) return;
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("button,input,textarea,select,summary,a,[contenteditable=true]")) return;
            const handle = !!target?.closest("[data-dictionary-drag-handle]");
            if (element.scrollTop > 0 && !handle) return;
            const touch = event.touches[0], bounds = element.getBoundingClientRect();
            if (touch.clientX < bounds.left || touch.clientX > bounds.right || touch.clientY < bounds.top || touch.clientY > bounds.bottom) return;
            start = { x: touch.clientX, y: touch.clientY, distance: 0, handle };
        };
        const move = (event: TouchEvent) => {
            if (!start || event.touches.length !== 1) return;
            const selection = window.getSelection();
            if ((selection && !selection.isCollapsed && element.contains(selection.anchorNode)) || (element.scrollTop > 0 && !start.handle)) { reset(); return; }
            const touch = event.touches[0], dy = touch.clientY - start.y, dx = Math.abs(touch.clientX - start.x);
            if (dy <= 0 || dx > Math.max(12, dy)) { reset(); return; }
            if (dy < 8) return;
            if (event.cancelable) event.preventDefault();
            start.distance = dy;
            element.setAttribute("data-dragging", "true");
            element.style.setProperty("--dictionary-drag-y", `${Math.min(dy, 180)}px`);
        };
        const end = () => { const dismiss = !!start && start.distance >= 96; reset(); if (dismiss && !savingMeaning.current) onClose(); };
        element.addEventListener("touchstart", begin, { passive: true });
        element.addEventListener("touchmove", move, { passive: false });
        element.addEventListener("touchend", end);
        element.addEventListener("touchcancel", reset);
        return () => { reset(); element.removeEventListener("touchstart", begin); element.removeEventListener("touchmove", move); element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", reset); };
    }, [onClose, editingMeaning]);
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
                const data=await dictionaryReference(word);
                if (!controller.signal.aborted) {
                    rememberPronunciations(word, data.phonetics);
                    setResult(data);requestAnimationFrame(()=>{if(!controller.signal.aborted)dialog.current?.scrollTo({top:restoreScroll.current});});
                }
            }
            catch (e) {
                if (!controller.signal.aborted)
                    setError(e instanceof TypeError ? "The dictionary couldn’t be reached. Try again later." : e instanceof Error ? e.message : "The dictionary is unavailable.");
            }
        })();
        return () => controller.abort();
    }, [word, attempt]);
    function resetEntry(){stopPronunciation();setResult(null);setError('');setSynonymsOpen(false);setMeaningError('');setMeaningSaved(false);setEditingMeaning(false);}
    function navigate(next:string){if(savingMeaning.current)return;if(editingMeaning){setMeaningError('Save or cancel your edit before exploring another entry.');meaningInput.current?.focus();return;}resetEntry();restoreScroll.current=0;setTrail(old=>next.trim().toLowerCase()===rootWord.trim().toLowerCase()?[]:[...old.slice(-18),{word:next,scroll:dialog.current?.scrollTop||0}]);requestAnimationFrame(()=>{dialog.current?.scrollTo({top:0});close.current?.focus({preventScroll:true});});}
    function back(){if(savingMeaning.current)return;const top=trail.at(-1)?.scroll||0;resetEntry();restoreScroll.current=top;setTrail(old=>old.slice(0,-1));requestAnimationFrame(()=>{close.current?.focus({preventScroll:true});});}
    return <dialog id={dialogId} ref={dialog} className={styles.sheet} aria-labelledby={id}
 onPointerDown={event => { backdropPress.current = outside(event.clientX, event.clientY); }}
 onClick={event => { const dismiss = backdropPress.current && outside(event.clientX, event.clientY); backdropPress.current = false; if (dismiss) requestClose(); }}
 onCancel={e => { e.preventDefault(); requestClose(); }}>
 <div className={styles.dragHandle} data-dictionary-drag-handle aria-hidden="true"><span /></div>
 <div className={styles.header} data-dictionary-drag-handle><span className={`${styles.kicker} wb-ui-text`}>DICTIONARY / REFERENCE</span><button ref={close} type="button" className={`wb-control wb-control-outline ${styles.close}`} aria-label="Close" title="Close dictionary" disabled={meaningBusy} onClick={requestClose}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
 {trail.length>0&&<button type="button" className="text-button" onClick={back}>Back to {trail.length>1?trail[trail.length-2].word:rootWord}</button>}
 <h2 id={id} className="wb-learning-content">{word}</h2>
 {result && <Pronunciation word={word} phonetics={result.phonetics} activeStyle/>}
 {!trail.length&&<aside className={styles.personal}>
 <div className={styles.personalHeader}><h3 className="wb-ui-text">My meaning</h3>{onSaveMeaning && !editingMeaning && <button ref={editButton} type="button" className="text-button" aria-label="Edit my meaning" onClick={() => { setDraft(meaning); setMeaningError(""); setMeaningSaved(false); setEditingMeaning(true); }}>Edit</button>}</div>
 {editingMeaning ? <form onSubmit={saveMeaning} aria-label="Edit my meaning">
 <label>My meaning<textarea ref={meaningInput} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} required disabled={meaningBusy} /></label>
 {meaningError && <p role="alert" className="wb-ui-text">{meaningError}</p>}
 <div className={styles.editActions}><button disabled={meaningBusy}>{meaningBusy ? "Saving…" : "Save meaning"}</button><button type="button" className="secondary" disabled={meaningBusy} onClick={() => { setEditingMeaning(false); setMeaningError(""); requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true })); }}>Cancel</button></div>
 </form> : <><p className="wb-learning-content">{meaning}</p>{meaningSaved && <span role="status" className={`${styles.savedNote} wb-ui-text`}>Meaning saved.</span>}</>}
 </aside>}
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
 <VideoContextSection key={"video:"+word} word={word} />
 <RelatedWords referenceReady={!!result||!!error} key={"related:"+word} word={word} synonyms={result?.synonyms||[]} onOpen={navigate} onSave={onRelatedSave} savedWords={savedWords}/>
 </dialog>;
}
