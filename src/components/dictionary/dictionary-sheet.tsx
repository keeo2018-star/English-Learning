"use client";
import { Button } from '@/components/ui/button';
import {isOriginalEnglish,type LearningCollection} from '@/lib/collections';
import {CollectionReference} from './collection-reference';
import {PronunciationControl} from './pronunciation-control';
import {ImeTextarea} from '@/components/ui/ime-field';
import {imeBlocksSubmit,formIsComposing} from '@/lib/ime';
import { useEffect, useId, useRef, useState } from "react";
import type { DictionaryResult } from "@/lib/dictionary";
import { Icon, IconButton } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { VocabularyRow } from "@/components/ui/vocabulary-row";
import type { ReactNode } from "react";
import {flushSync} from "react-dom";
import { rememberPronunciations } from "@/lib/pronunciation";
import styles from "./dictionary.module.css";
import {dictionaryReference,ReferenceRequestError} from '@/lib/dictionary-client';
import { RelatedWords,type RelatedInput } from './related-words';
import {stopPronunciation} from '@/lib/pronunciation';
import {DictionaryPronunciation,DictionaryReferenceContent} from './dictionary-reference';
import {BilingualSearch} from './bilingual-search';
import {LearningNotes} from './learning-notes';
import { VideoContextSection } from './video-context-section';
export function DictionaryButton({ word, meaning, onSaveMeaning,onRelatedSave,savedWords,collection,example, browse, details, metadata, management, blockClose }: {
    browse?:boolean; blockClose?:boolean; details?:ReactNode; management?:ReactNode; metadata?:string; example?:string;collection?:LearningCollection;onRelatedSave?:(input:RelatedInput)=>Promise<void>;savedWords?:string[];
    onSaveMeaning?: (meaning: string) => Promise<void>;
    word: string;
    meaning: string;
}) {
    const [open, setOpen] = useState(false);
    const dialogId = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const openEntry=()=>setOpen(true);
    return <>{browse ? <VocabularyRow expression={word} meaning={meaning} metadata={metadata} buttonRef={trigger} onClick={openEntry}/> :
      <Button ref={trigger} variant="secondary" size="medium" className="wb-dictionary-action" aria-label={"Dictionary for " + word} aria-expanded={open} aria-controls={open?dialogId:undefined} aria-haspopup="dialog" onClick={openEntry}>Dictionary <Icon name="chevronRight" size={16}/></Button>}
      {open && <DictionarySheet returnFocus={trigger} blockClose={blockClose} details={details} management={management} example={example} collection={collection} dialogId={dialogId} word={word} meaning={meaning} onSaveMeaning={onSaveMeaning} onRelatedSave={onRelatedSave} savedWords={savedWords} onClose={() => setOpen(false)}/>}</>;
}
function DictionarySheet({returnFocus,searchOnly=false, dialogId, word:rootWord, meaning:rootMeaning, onSaveMeaning:rootSaveMeaning, onClose,onRelatedSave,savedWords,collection,example,details,management,blockClose }: {
    blockClose?:boolean; details?: ReactNode; management?: ReactNode; returnFocus?:React.RefObject<HTMLButtonElement|null>;
    example?:string;collection?:LearningCollection;onRelatedSave?:(input:RelatedInput)=>Promise<void>;savedWords?:string[];
    onSaveMeaning?: (meaning: string) => Promise<void>;
    dialogId: string;
    word: string;
    meaning: string;
    onClose: () => void;searchOnly?:boolean;
}) {
    const englishReference=!collection||collection.target_language==='en';
    const [trail,setTrail]=useState<{word:string;scroll:number}[]>([]);
    const word=trail.at(-1)?.word||rootWord,meaning=trail.length?'':rootMeaning,onSaveMeaning=trail.length?undefined:rootSaveMeaning;
    const dialog = useRef<HTMLDivElement>(null), restoreScroll=useRef(0);
    const savingMeaning = useRef(false);
    const meaningInput = useRef<HTMLTextAreaElement>(null);
    const editScroll = useRef(0);
    const editButton = useRef<HTMLButtonElement>(null);
    const [editingMeaning, setEditingMeaning] = useState(false), [draft, setDraft] = useState(meaning),
        [meaningBusy, setMeaningBusy] = useState(false), [meaningError, setMeaningError] = useState(""), [meaningSaved, setMeaningSaved] = useState(false);
    function finishEditing() {
        setEditingMeaning(false);
        setMeaningError('');
        requestAnimationFrame(()=>{
            dialog.current?.scrollTo({top:editScroll.current});
            editButton.current?.focus({preventScroll:true});
        });
    }
    function beginEditing() {
        editScroll.current=dialog.current?.scrollTop??0;
        flushSync(()=>{setDraft(meaning);setMeaningError('');setMeaningSaved(false);setEditingMeaning(true);});
        dialog.current?.scrollTo({top:0});
        meaningInput.current?.focus({preventScroll:true});
    }
    async function saveMeaning(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        event.stopPropagation();
        if (!onSaveMeaning || savingMeaning.current || imeBlocksSubmit(event.currentTarget,event.timeStamp)) return;
        const value = draft.trim();
        if (!value) { setMeaningError("Enter your meaning before saving."); return; }
        savingMeaning.current = true; setMeaningBusy(true); setMeaningError("");
        try { await onSaveMeaning(value); setMeaningSaved(true); finishEditing(); }
        catch (error) { setMeaningError(error instanceof Error ? error.message : "Could not save your meaning. Please try again."); }
        finally { savingMeaning.current = false; setMeaningBusy(false); }
    }
    const [closeAlert,setCloseAlert]=useState(false);
    function requestClose() {
        if(blockClose){setCloseAlert(true);return;}
        if (savingMeaning.current || formIsComposing(dialog.current)) return;
        if (editingMeaning && draft !== meaning) { setMeaningError("Save or cancel your edit before closing."); meaningInput.current?.focus(); return; }
        onClose();
    }
    const [result, setResult] = useState<DictionaryResult | null>(null), [error, setError] = useState<{message:string;status?:number}|null>(null), [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if(searchOnly||!englishReference)return;
        const controller = new AbortController();
        (async () => {
            try {
                const data=await dictionaryReference(word);
                if (!controller.signal.aborted) {
                    rememberPronunciations(word, data.phonetics);
                    setResult(data);requestAnimationFrame(()=>{if(!controller.signal.aborted){const active=document.activeElement;if(!(active instanceof Element&&dialog.current?.contains(active)&&active.matches('input,textarea')))dialog.current?.scrollTo({top:restoreScroll.current});}});
                }
            }
            catch (e) {
                if (!controller.signal.aborted) {
                    setError({status:e instanceof ReferenceRequestError?e.status:undefined,
                        message:e instanceof TypeError?"The dictionary couldn’t be reached.":e instanceof Error?e.message:"The dictionary is unavailable."});
                }
            }
        })();
        return () => controller.abort();
    }, [word, attempt,searchOnly,englishReference]);
    function resetEntry(){stopPronunciation();setResult(null);setError(null);setMeaningError('');setMeaningSaved(false);setEditingMeaning(false);}
    function navigate(next:string){if(savingMeaning.current||formIsComposing(dialog.current))return;if(blockClose){setCloseAlert(true);return;}if(editingMeaning){setMeaningError('Save or cancel your edit before exploring another entry.');meaningInput.current?.focus();return;}resetEntry();restoreScroll.current=0;setTrail(old=>next.trim().toLowerCase()===rootWord.trim().toLowerCase()?[]:[...old.slice(-18),{word:next,scroll:dialog.current?.scrollTop||0}]);requestAnimationFrame(()=>{dialog.current?.scrollTo({top:0});});}
    function back(){if(savingMeaning.current||formIsComposing(dialog.current))return;const top=trail.at(-1)?.scroll||0;resetEntry();restoreScroll.current=top;setTrail(old=>old.slice(0,-1));}
    const formId=dialogId+'-meaning';
    const referenceHeadword=englishReference && error?.status===404 && /^([a-z]{2,})\s+\S/i.exec(word)?.[1];
    return <Sheet id={dialogId} portal title={editingMeaning?'Edit meaning':'Dictionary'} wide swipe={!editingMeaning&&!blockClose} onBackdrop bodyRef={dialog} busy={meaningBusy} returnFocus={returnFocus} onClose={requestClose}
      footer={editingMeaning&&<><Button variant="secondary" disabled={meaningBusy} onClick={finishEditing}>Cancel</Button><Button type="submit" form={formId} disabled={meaningBusy}>{meaningBusy?'Saving…':'Save meaning'}</Button></>}>
 {editingMeaning&&<form id={formId} className={styles.meaningEditor} onSubmit={saveMeaning} aria-label="Edit my meaning">
   <h3>{word}</h3>
   <label>My meaning<ImeTextarea aria-label="My meaning" lang={collection?.explanation_language==='en'?'en':'zh-Hans'} autoCapitalize="none" autoCorrect="off" spellCheck={false} ref={meaningInput} value={draft} onValueChange={setDraft} maxLength={2000} required readOnly={meaningBusy}/></label>
   {meaningError&&<p role="alert">{meaningError}</p>}
 </form>}
 <div hidden={editingMeaning}>
 {searchOnly?<BilingualSearch onSave={onRelatedSave} savedWords={savedWords}/>:<>
 {trail.length>0&&<button type="button" className="text-button" onClick={back}>Back to {trail.length>1?trail[trail.length-2].word:rootWord}</button>}
 <h2 className={`${styles.hero} wb-learning-content`}>{word}</h2>
 {result&&result.english[0]?.partOfSpeech&&<p className="wb-supporting">{result.english[0].partOfSpeech}</p>}
 {!englishReference&&<PronunciationControl text={word} language={collection?.target_language}/>}
 {englishReference&&<DictionaryPronunciation word={word} phonetics={result?.phonetics??[]} activeStyle/>}
 {!trail.length&&(onSaveMeaning||meaning)&&<aside className={styles.personal}>
 <div className={styles.personalHeader}><h3 className="wb-ui-text">{onSaveMeaning?"My meaning":"Meaning"}</h3>{onSaveMeaning && !editingMeaning && <IconButton ref={editButton} icon="pencil" label="Edit my meaning" onClick={beginEditing}/>}</div>
 <p className="wb-learning-content">{meaning}</p>{meaningSaved&&<span role="status" className={styles.savedNote}>Meaning saved.</span>}
 </aside>}
 {englishReference&&!result && !error && <p className="wb-supporting" role="status">Looking up dictionary reference…</p>}
 {error && <p className="wb-supporting" role="status">{error.status===404?
   (/\s/u.test(word)?'No exact reference for this expression. Your saved wording is shown above.':'No exact dictionary entry available.'):
   error.status===400?'This expression is outside the reference provider’s lookup format.':
   <>{error.message} <button type="button" className="text-button" onClick={()=>{setError(null);setResult(null);setAttempt(v=>v+1);}}>Try again</button></>}</p>}
 {error&&referenceHeadword&&<button type="button" className="text-button" onClick={()=>navigate(referenceHeadword)}>Look up first word: {referenceHeadword}</button>}
 {!trail.length&&details}
 {closeAlert&&blockClose&&<p role="alert">Save or cancel your entry edit before closing.</p>}
 {result && <DictionaryReferenceContent key={word} result={collection?.explanation_language==='en'?{...result,chinese:[],examples:result.examples.map(example=>({...example,translation:''}))}:result} word={word}/>}
 {(!englishReference||!!result||!!error)&&<LearningNotes key={JSON.stringify([word,collection?.id,collection?.explanation_language,collection?.proficiency_level,result?.english[0]?.partOfSpeech])}
   input={{word,target:collection?.target_language||'en',explanation:collection?.explanation_language||'zh-CN',
     level:collection?.proficiency_level||'unspecified',partOfSpeech:result?.english[0]?.partOfSpeech||''}}/>}
 {englishReference&&<>
 <VideoContextSection key={"video:"+word} word={word} />
 {isOriginalEnglish(collection)&&<RelatedWords referenceReady={!!result||!!error} key={"related:"+word} word={word} meaning={!trail.length?meaning.trim()||result?.chinese[0]||'':result?.chinese[0]||''} synonyms={result?.synonyms||[]} onOpen={navigate} onSave={onRelatedSave} savedWords={savedWords}/>}</>}
 {!trail.length&&!details&&example&&<blockquote className="wb-learning-content">{example}</blockquote>}
 {collection&&!englishReference&&<CollectionReference key={collection.target_language + ":" + word} word={word} language={collection.target_language}/>}
 {!trail.length&&management}
 </>}
 </div>
 </Sheet>;
}


export function DictionarySearchButton({onSave,savedWords}:{onSave?:(input:RelatedInput)=>Promise<void>;savedWords?:string[]}){const [open,setOpen]=useState(false),id=useId();return <><button type="button" className="text-button dictionary-shortcut" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>Dictionary ↔ 中文</button>{open&&<DictionarySheet dialogId={id} word="" meaning="" searchOnly onRelatedSave={onSave} savedWords={savedWords} onClose={()=>setOpen(false)}/>}</>;}
