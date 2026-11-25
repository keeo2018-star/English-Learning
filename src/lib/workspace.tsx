"use client";
import { useEffect, useState, useCallback, useRef, useMemo, useDeferredValue, startTransition } from "react";
import {ImeInput,ImeTextarea} from '@/components/ui/ime-field';
import {useCollections} from './use-collections';
import {collectionItems,isOriginalEnglish,learningLanguages,type LearningCollection} from './collections';
import {LearningHeader} from '@/components/collections/learning-header';
import {CollectionAddFlow} from '@/components/collections/collection-add-flow';
import {imeBlocksSubmit} from './ime';
import Link from "next/link";
import {afterSaveAi} from "./ai-client";
import {resolveExample} from "./context-examples";
import {storedLibrary,pendingReviews,enqueueReview,storeReviewSession,storedReviewSession} from './offline-store';
import {syncOfflineReviews} from './offline-sync';
import {rememberLibrary,offlineLibrary,forgetLibrary,offlineIdentity,prepareOfflineIdentity} from "./offline-library";
import {ContextExample} from "@/components/learning/context-example";
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
import {captureKey,textLength,ITEM_TEXT_LIMIT,CONTEXT_TEXT_LIMIT,type AddOutcome} from './add-editor';
import { DictionaryButton, WordPronunciation } from "@/components/dictionary/dictionary-sheet";
import { contextPrompt, createReviewQueue, rateItem, reviewState, type RecallRating } from "./review";
import { preloadPronunciation, prepareReviewPronunciation, stopPronunciation } from "./pronunciation";
import { ReviewPronunciation } from "@/components/dictionary/review-pronunciation";
import { mergeReviewSessions, completeSessionCard, newReviewSession, readReviewSession, removeSessionItem, reviewSessionKey, type ReviewSession } from "./review-session";
import { DEMO_EVENTS_KEY } from "@/components/learning/learning-calendar";
import { indexLibrary, normalizeLibraryQuery, LIBRARY_PAGE_SIZE } from "./library-search";
import {useVoiceNotes} from './use-voice-notes';
import {clearItemVoice,voiceFiles,removeVoiceFiles,uploadVoice,voiceError,type VoiceDraft} from './voice-notes';
import {VoiceManager} from '@/components/voice-notes/voice-manager';
import {VoiceConfirm} from '@/components/voice-notes/voice-confirm';
import {ExpressionReviewAudio} from '@/components/voice-notes/review-audio';
type NewLearningItem = { request_id?:string;collection_id?:string;example_source?:"ai"|"dictionary"|"personal"|null; word: string; meaning: string; example: string; item_type?: "word" | "expression" | null };
type SaveResult = Word | null;
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
    [refreshed,setRefreshed]=useState(false),
    [loadError, setLoadError] = useState(false),
    [allWords, setWords] = useState<Word[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(() => searchParams.get("q") || ""),
    [libraryPage, setLibraryPage] = useState(0),
    [syncError, setSyncError] = useState(false),
    [revealed, setRevealed] = useState<string | null>(null),
    [session, setSession] = useState<ReviewSession | null>(null),
    [typeFilter, setTypeFilter] = useState<"all" | "word" | "expression">("all"),
    [autoChoice,setAutoChoice]=useState<{key:string;enabled:boolean}|null>(null),
    [pendingRating, setPendingRating] = useState<RecallRating | null>(null),
    [now, setNow] = useState(0),
    [editing, setEditing] = useState<string | null>(null),
    [deleting, setDeleting] = useState<Word | null>(null);
  const learning = useCollections(user?.id);
  const original = learning.collections.find(c=>c.target_language==='en'&&c.explanation_language==='zh-CN');
  const collection = learning.enabled ? learning.active : original||null;
  const contextMissing=!!user&&allWords.some(item=>item.collection_id)&&!learning.collections.length;
  const [allLanguages,setAllLanguages] = useState(false);
  const sessionScope = collection && collection.id!==original?.id ? collection.id : undefined;
  const sessionScopeRef = useRef(sessionScope);useEffect(()=>{sessionScopeRef.current=sessionScope;},[sessionScope]);
  const words = useMemo(()=>contextMissing?[]:page==='library'&&allLanguages&&learning.enabled?allWords.filter(item=>!item.collection_id||learning.collections.some(c=>c.id===item.collection_id)):collectionItems(allWords,collection,collection?.id===original?.id),[allWords,collection,page,allLanguages,learning.enabled,original?.id,contextMissing,learning.collections]);
  const entryCollection=(item:Word):LearningCollection|undefined=>item.collection_id?learning.collections.find(c=>c.id===item.collection_id):original;
  const missingContext=learning.enabled&&allWords.some(item=>item.collection_id&&!learning.collections.some(c=>c.id===item.collection_id));
  const refreshCollections=learning.refresh;
  useEffect(()=>{if(missingContext)refreshCollections();},[missingContext,refreshCollections]);
  function selectCollection(id:string|null){if(busy||editing||captureBusy)return;if(id===collection?.id){setAllLanguages(false);return;}stopPronunciation();setMessage('');setRevealed(null);setSession(null);requestedRandom.current=false;setLibraryPage(0);setAllLanguages(id===null);if(id)learning.select(id);}
  const [captureBusy,setCaptureBusy]=useState(false);
  const [offlineNotice,setOfflineNotice]=useState('');
  const [deleteTrigger,setDeleteTrigger]=useState<HTMLElement|null>(null);
  const [deleteHasRecording,setDeleteHasRecording]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const deletionInFlight=useRef(false),deleteFocusPending=useRef(false);
  const [voiceTypeEdit,setVoiceTypeEdit]=useState<{word:Word;changes:NewLearningItem}|null>(null);
  const [voiceUploads,setVoiceUploads]=useState<{owner:string;item:Word;draft:VoiceDraft;error:string}[]>([]);
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
        const cached=await storedLibrary(u.id).catch(()=>null)||offlineLibrary(u.id);
        if(!navigator.onLine){if(!cached)throw Error('No offline Library is prepared on this device. Connect once to load it.');setWords(cached);setLoadError(false);setOfflineNotice('Offline · Reviews save on this device and sync when you reconnect.');return;}
        try{await syncOfflineReviews(u.id);setOfflineNotice('');}catch(error){setOfflineNotice(error instanceof Error?error.message:'Your reviews are saved on this device.');}
        if(version!==loadVersion.current||accountId.current!==u.id)return;
        const all: Word[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await supabase.from("words").select("*").eq("user_id", u.id)
            .order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
          if (version !== loadVersion.current) return;
          if (error) throw error;
          all.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        const queued=await pendingReviews(u.id).catch(()=>[]),local=await storedLibrary(u.id).catch(()=>null)||offlineLibrary(u.id)||cached;
        if(version!==loadVersion.current||accountId.current!==u.id)return;
        const pendingIds=new Set(queued.map(e=>e.itemId)),localById=new Map(local?.map(row=>[row.id,row])||[]);const merged=all.map(row=>pendingIds.has(row.id)?localById.get(row.id)||row:row);
        setWords(merged);rememberLibrary(u.id,merged);prepareOfflineIdentity(u.id);
      } else if (!supabase) {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (!Array.isArray(saved))
          throw new Error("Your local library could not be read.");
        setWords(saved);
      } else {setWords([]);if(!navigator.onLine)setMessage('No offline Library is prepared on this device. Connect once and load your Library to prepare it.');}
      if (version === loadVersion.current) { setSyncError(false); setLoadError(false); }
    } catch (error) {
      if (version === loadVersion.current && background) { setSyncError(true); }
      else if (version === loadVersion.current) {
        const cached = u ? offlineLibrary(u.id)||await storedLibrary(u.id).catch(()=>null) : null;
        setWords(cached || []);
        setLoadError(!cached);
        setMessage(cached ? "Offline · Your saved Library is available. Reviews save on this device." : errorMessage(error, "Could not load your library."));
      }
    } finally {
      if (version === loadVersion.current) {setReady(true);setRefreshed(true);}
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
    const client = supabase;let active=true,authRevision=0;
    const prepared=offlineIdentity();
    if(prepared){const local=offlineLibrary(prepared.id);accountId.current=prepared.id;setUser(prepared);if(local){setWords(local);setReady(true);if(!navigator.onLine)setOfflineNotice('Offline · Reviews save on this device and sync when you reconnect.');}const restoreVersion=loadVersion.current;void storedLibrary(prepared.id).then(rows=>{if(rows&&accountId.current===prepared.id&&loadVersion.current===restoreVersion){setWords(rows);setReady(true);}}).catch(()=>{});}
    void client.auth.getSession().then(({ data, error }) => {
      if(!active||authRevision)return;
      if(!data.session&&prepared&&!navigator.onLine)return;
      if (error) {
        if(prepared&&accountId.current===prepared.id){void load(prepared);return;}
        setMessage(error.message);
        setReady(true);
        return;
      }
      accountId.current = data.session?.user.id || null;
      setUser(data.session?.user || null);
      void load(data.session?.user || null);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if(!active)return;authRevision++;
      if(_event==='INITIAL_SESSION'&&!session&&prepared&&!navigator.onLine)return;
      if (accountId.current !== (session?.user.id || null)) {
        ++loadVersion.current;
        if(accountId.current)forgetLibrary(accountId.current);
        accountId.current = session?.user.id || null;
        setWords([]);
        setRevealed(null);
        setSession(null);
        requestedRandom.current = false;

        setEditing(null);setAllLanguages(false);
        setDeleting(null);
        setVoiceTypeEdit(null);setVoiceUploads([]);
        setLibraryPage(0);
        setSyncError(false);setOfflineNotice('');
        setReady(false);setRefreshed(false);
      }
      setUser(session?.user || null);
      setTimeout(() => void load(session?.user || null), 0);
    });
    return () => {
      active=false;data.subscription.unsubscribe();
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, [load]);
  useEffect(() => {
    if (!ready || (supabase && !user)) return;
    const refresh = () => { if (document.visibilityState === "visible" && !ratingInFlight.current && !saving.current && !editing) { void load(user, true); } };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("online", refresh);
    window.addEventListener("noted-reviews-synced",refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(refresh, 30000);
    const client = supabase;
    const channel = client && user ? client.channel(`library:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "words", filter: `user_id=eq.${user.id}` }, refresh).subscribe() : null;
    return () => { clearInterval(timer); window.removeEventListener("online", refresh);window.removeEventListener("noted-reviews-synced",refresh); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", visible); if (channel && client) void client.removeChannel(channel); };
  }, [ready, user, load, editing]);
  const account = user?.id || "local-demo";
  const browseKey=`noted-library-browse-v1:${account}:${collection?.id||'legacy'}`;
  const [restoredBrowse,setRestoredBrowse]=useState('');
  const urlQuery=searchParams.get('q');
  useEffect(()=>{
    if(page!=='library')return;
    let stored:{query?:unknown;type?:unknown;page?:unknown;all?:unknown}={};try{stored=JSON.parse(localStorage.getItem(browseKey)||'{}')||{};}catch{}
    setQuery(urlQuery!==null?urlQuery:typeof stored.query==='string'?stored.query:'');
    setTypeFilter(urlQuery!==null?'all':stored.type==='word'||stored.type==='expression'?stored.type:'all');
    setLibraryPage(urlQuery!==null?0:typeof stored.page==='number'&&Number.isInteger(stored.page)&&stored.page>=0?stored.page:0);
    setAllLanguages(urlQuery===null&&learning.enabled&&stored.all===true);setRestoredBrowse(browseKey);
  },[page,browseKey,urlQuery,learning.enabled]);
  useEffect(()=>{if(page==='library'&&restoredBrowse===browseKey)try{localStorage.setItem(browseKey,JSON.stringify({query,type:typeFilter,page:libraryPage,all:allLanguages}));}catch{}},[page,restoredBrowse,browseKey,query,typeFilter,libraryPage,allLanguages]);
  const pronunciationKey=`noted-auto-pronunciation:${account}:${collection?.id||'legacy'}`;
  const storedAuto=useMemo(()=>{try{const value=localStorage.getItem(pronunciationKey);return value===null?collection?.preferences.auto_pronunciation!==false:value!=='off';}catch{return collection?.preferences.auto_pronunciation!==false;}},[pronunciationKey,collection?.preferences.auto_pronunciation]);
  const autoPronunciation=autoChoice?.key===pronunciationKey?autoChoice.enabled:storedAuto;
  useEffect(()=>{if(ready&&!loadError&&user?.id)rememberLibrary(user.id,allWords);},[ready,loadError,user?.id,allWords]);
  const persistSession = useCallback((next: ReviewSession) => {
    try { localStorage.setItem(reviewSessionKey(next.account,next.collectionId), JSON.stringify(next)); } catch { /* An in-memory session still works when storage is restricted. */ }
    void storeReviewSession(next).catch(()=>{});if(next.collectionId===sessionScopeRef.current&&next.account===(accountId.current||'local-demo'))setSession(next);
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if(event.key===reviewSessionKey(account,sessionScope)){const incoming=readReviewSession(event.newValue,account,sessionScope);if(incoming)setSession(previous=>mergeReviewSessions(incoming,previous));}
      if (!supabase && event.key === storageKey) void load(null);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [account,sessionScope, load]);
  useEffect(()=>{requestedRandom.current=false;setSession(null);setRevealed(null);stopPronunciation();},[collection?.id]);
  const persistLocal = (next: Word[]) => {
    localStorage.setItem(storageKey, JSON.stringify(next));
    setWords(next);
  };
  async function saveEntry(input: NewLearningItem,propagate=false,requestId?:string): Promise<SaveResult> {
    if (saving.current) return null;
    saving.current = true;
    setBusy(true);
    setMessage("");
    const { item_type,collection_id:destination, ...content } = input;
    const entry = {
      ...content,
      ...(destination||collection?{collection_id:destination||collection!.id}:{}),
      ...(item_type ? { item_type } : {}),
      word: input.word.trim(),
      meaning: input.meaning.trim(),
      example: requestId?input.example:input.example.trim(),
      due_at: new Date().toISOString(),
      interval_days: 0,
      created_at: new Date().toISOString(),
    };
    let created:Word|null=null;
    try {
      if (!entry.word)
        throw new Error("Enter a word or expression.");
      if (supabase) {
        if (!user) throw new Error("Please sign in first.");
        let { data, error } = await supabase
          .from("words")
          .insert({ ...entry, ...(requestId?{id:requestId}:{}), user_id: user.id })
          .select("*")
          .single();
        if(error?.code==='23505'&&requestId){
          const previous=await supabase.from('words').select('*').eq('id',requestId).eq('user_id',user.id).maybeSingle();
          if(previous.data&&previous.data.word===entry.word&&previous.data.meaning===entry.meaning&&previous.data.example===entry.example&&(!entry.collection_id||previous.data.collection_id===entry.collection_id)){data=previous.data;error=null;}
        }
        if (error && !entry.meaning && error.code === '23514') throw new Error('Add a meaning before saving. Your text is kept.');
        if (error) throw error;
        if (accountId.current !== user.id) return null;
        created=data;setWords((previous) => [data, ...previous.filter(item=>item.id!==data.id)]);
      } else {created={...entry,id:crypto.randomUUID()};persistLocal([created,...allWords]);}
      const savedContext=learning.collections.find(c=>c.id===created?.collection_id)||collection;
      if(created&&user&&isOriginalEnglish(savedContext))void afterSaveAi(user.id,created.word);
      if(created&&isOriginalEnglish(savedContext)&&!created.example?.trim())void resolveExample(user?.id||"local-demo",created);
      setMessage("Word saved. Ready for your next review.");
      return created;
    } catch (error) {
      if(propagate)throw error;
      setMessage(errorMessage(error, "Could not save word."));
      return null;
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  async function saveRelated(request:NewLearningItem,context:LearningCollection|undefined=collection||undefined){
    const {request_id,...input}=request;
    const key=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
    if(collectionItems(allWords,context||null,context?.id===original?.id).some(w=>key(w.word)===key(input.word)))return;
    try{const result=await saveEntry({...input,...(context?{collection_id:context.id}:{})},true,request_id);if(!result)throw new Error('Could not save right now. Please try again.');}
    catch(error){if((error as {code?:string}).code==='23505'&&/This item is already in your Library/i.test((error as {message?:string}).message||'')){void load(user,true);return;}throw error instanceof Error?error:new Error((error as {message?:string}).message||'Could not save. Please try again.');}
  }
  async function add(event: React.FormEvent<HTMLFormElement>,voice?:VoiceDraft,requestId?:string):Promise<AddOutcome> {
    event.preventDefault();const form=event.currentTarget,values=new FormData(form);
    const content={word:String(values.get('word')||''),meaning:String(values.get('meaning')||''),example:String(values.get('example')||''),item_type:values.get('item_type')==='auto'?itemType({word:String(values.get('word')||'')}):String(values.get('item_type')) as 'word'|'expression'};
    if(textLength(content.word.trim())>ITEM_TEXT_LIMIT||textLength(content.example)>CONTEXT_TEXT_LIMIT)return {saved:false,message:'Extract or shorten the item/context before saving. Your text has been kept.'};
    if(words.some(item=>item.id!==requestId&&captureKey(item.word)===captureKey(content.word)))return {saved:false,duplicate:true,message:'Already in your Library'};
    try{
      const result=await saveEntry({...content,...(values.get('example_source')==='ai'?{example_source:'ai' as const}:{})},true,requestId);if(!result)return {saved:false,message:'Another save is in progress. Please retry.'};
      setMessage('Added to Library');
      if(voice){setBusy(true);try{await uploadVoice(result.id,voice);if(accountId.current===user?.id)setMessage('Expression and voice note saved.');}catch(error){if(accountId.current===user?.id){setVoiceUploads(previous=>[...previous,{owner:user?.id||'local-demo',item:result,draft:voice,error:voiceError(error)}]);setMessage('Expression saved. Voice note upload needs retry.');}}finally{setBusy(false);}}
      form.reset();return {saved:true};
    }catch(error){if((error as {code?:string}).code==='23505'){void load(user,true);return {saved:false,duplicate:true,message:'Already in your Library'};}const message=errorMessage(error,'Could not save. Check your connection and retry.');setMessage('');return {saved:false,message};}
  }
  async function requestDelete(word:Word){
    if(busy||ratingInFlight.current||deletionInFlight.current)return;
    deletionInFlight.current=true;setDeleteError('');
    setDeleteTrigger(document.activeElement instanceof HTMLElement?document.activeElement:null);
    setBusy(true);setMessage('');const owner=accountId.current;
    try{let files=[];try{files=await voiceFiles([word.id]);}catch(error){const code=(error as {code?:string}).code;if(!['PGRST202','PGRST205'].includes(code||''))throw error;}if(accountId.current!==owner)return;setDeleteHasRecording(files.length>0);setDeleting(word);}catch(error){setMessage(voiceError(error));}finally{deletionInFlight.current=false;setBusy(false);}
  }
  async function remove(id: string):Promise<boolean> {
    if(deletionInFlight.current)return false;
    deletionInFlight.current=true;setDeleteError('');
    const owner = accountId.current;
    setBusy(true);
    setMessage("");
    try {
      if (supabase) {
        stopPronunciation();await clearItemVoice(id);
        const { error } = await supabase
          .from("words")
          .delete()
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;
        if (accountId.current !== owner) return false;
        ++loadVersion.current;
        setWords((previous) => previous.filter((w) => w.id !== id));
      } else persistLocal(allWords.filter((w) => w.id !== id));
      let latest=session;
      try { latest=readReviewSession(localStorage.getItem(reviewSessionKey(account,sessionScope)),account,sessionScope)||latest; } catch { /* Keep the in-memory session. */ }
      if(latest)persistSession(removeSessionItem(latest,id));
      setRevealed(null);return true;
    } catch (error) {
      setDeleteError(errorMessage(error, "Could not delete entry. Please try again."));return false;
    } finally {
      deletionInFlight.current=false;setBusy(false);
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
      } else persistLocal(allWords.map(item => item.id === word.id ? { ...item, meaning } : item));
      setMessage("Meaning updated.");
    } finally { saving.current = false; setBusy(false); }
  }
  async function edit(e: React.FormEvent<HTMLFormElement>, word: Word) {
    e.preventDefault();
    if(imeBlocksSubmit(e.currentTarget,e.timeStamp))return;
    const form = new FormData(e.currentTarget);
    const changes = {
      word: String(form.get("word")).trim(),
      meaning: String(form.get("meaning")).trim(),
      example: String(form.get("example")).trim(),
      ...('example_source' in word && String(form.get('example')).trim()!==word.example ? {example_source:String(form.get('example')).trim()?'personal' as const:null}:{}),
      ...(word.item_type !== undefined || String(form.get("item_type")) !== itemType(word)
        ? { item_type: String(form.get("item_type")) as "word" | "expression" } : {}),
    };
    if(supabase&&changes.item_type==='word'&&itemType(word)==='expression'){
      try{if((await voiceFiles([word.id])).length){setVoiceTypeEdit({word,changes});return;}}catch(error){const code=(error as {code?:string}).code;if(!['PGRST202','PGRST205'].includes(code||'')){setMessage(voiceError(error));return;}}
    }
    await applyEdit(word,changes);
  }
  async function applyEdit(word:Word,changes:NewLearningItem,preserve=false,removeRecording=false){
    setBusy(true);
    setMessage("");
    try {
      if (!changes.word)
        throw new Error("Enter a word or expression.");
      if(captureKey(changes.word)!==captureKey(word.word)&&allWords.some(item=>item.id!==word.id&&item.collection_id===word.collection_id&&captureKey(item.word)===captureKey(changes.word)))throw new Error('Already in this Library. Choose a different entry.');
      let updated = { ...word, ...changes };
      if (supabase) {
        if (!user) throw new Error("Please sign in first.");
        if(removeRecording){stopPronunciation();await clearItemVoice(word.id);}
        const { data, error } = preserve
          ? await supabase.rpc('voice_note_edit_item',{p_item:word.id,p_changes:changes,p_preserve:true})
          : await supabase.from("words").update(changes).eq("id",word.id).select("*").single();
        if (error) throw error;
        if (accountId.current !== user.id) return;
        updated = data;
        setWords((previous) =>
          previous.map((item) => (item.id === word.id ? updated : item)),
        );
      } else
        persistLocal(
          allWords.map((item) => (item.id === word.id ? updated : item)),
        );
      setEditing(null);setVoiceTypeEdit(null);
      setMessage("Word updated.");
    } catch (error) {
      setVoiceTypeEdit(null);
      setMessage(errorMessage(error, "Could not update word."));
    } finally {
      setBusy(false);
    }
  }
  async function grade(word: Word, rating: RecallRating) {
    if (ratingInFlight.current) return;
    ratingInFlight.current = true;++loadVersion.current;
    setPendingRating(rating);
    const owner = accountId.current;
    setNow(Date.now());
    setBusy(true);
    setMessage("");
    let updated = rateItem(word, rating);
    const currentSession = randomMode ? visibleSession : null;
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
        const localReview=async()=>{const local=await enqueueReview(user.id,word,rating,eventId!,allWords,Date.now(),currentSession);if(accountId.current!==owner)return;updated=local.event.updated;rememberLibrary(user.id,local.items,false);setWords(local.items);setOfflineNotice('Review saved on this device · Waiting to sync.');};
        if(!navigator.onLine||(await pendingReviews(user.id).catch(()=>[])).length){await localReview();}
        else {
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
        if(error&&(!error.code&&/fetch|network|load failed|connection/i.test(error.message)||!navigator.onLine)){await localReview();}
        else {
        if (error) throw error;
        if (accountId.current !== owner) return;
        updated = data as Word;
        if (!updated?.id || updated.id !== word.id) throw new Error("Could not confirm the saved review. Please retry.");
        setWords(previous => previous.map(w => w.id === word.id ? updated : w));
        }
        }
        if(accountId.current!==owner)return;
      } else {
        const events = JSON.parse(localStorage.getItem(DEMO_EVENTS_KEY) || "[]");
        if (!events.some((e: { id: string }) => e.id === eventId)) {
          events.push({ id: eventId, learning_item_id: word.id, reviewed_at: new Date().toISOString(), familiarity_rating: rating === "sure" ? "sure" : "not_sure" });
          localStorage.setItem(DEMO_EVENTS_KEY, JSON.stringify(events));
          persistLocal(allWords.map(w => w.id === word.id ? updated : w));
        }
      }
      focusNextCard.current = true;
      setRevealed(null);
      if (currentSession && entry) {
        let latest: ReviewSession | null = null;
        try { latest = readReviewSession(localStorage.getItem(reviewSessionKey(account,sessionScope)), account,sessionScope); } catch { /* In-memory sessions remain usable. */ }
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

  const due = useMemo(() => words.filter((w) => new Date(w.due_at).getTime() <= now), [words, now]);
  const visibleSession=session?.account===account&&session.collectionId===sessionScope?session:null;
  const randomQueue = visibleSession?.queue ?? null;
  const randomPosition = visibleSession ? visibleSession.queue.findIndex(entry => !visibleSession.completed.includes(entry.eventId) && words.some(word => word.id === entry.id)) : 0;
  const reviewCard = randomPosition >= 0 ? randomQueue?.[randomPosition] : undefined;
  const sessionTotal = visibleSession?.queue.filter(entry => visibleSession.completed.includes(entry.eventId) || words.some(word => word.id === entry.id)).length ?? 0;
  const reviewedCount = visibleSession?.completed.length ?? 0;
  const card = randomMode ? words.find(word => word.id === reviewCard?.id) : due[0];
  useEffect(()=>{
    if(deleting||!deleteFocusPending.current)return;
    deleteFocusPending.current=false;
    if(page==='review')(revealButton.current||document.querySelector<HTMLButtonElement>('.review-completion button'))?.focus({preventScroll:true});
    else librarySearch.current?.focus({preventScroll:true});
  },[deleting,page]);
  const selectedDirection = randomMode ? reviewCard?.direction ?? "forward" : "forward";
  const direction = selectedDirection === 'reverse' && !card?.meaning.trim() ? 'forward' : selectedDirection;
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
      if (word) void preloadPronunciation(word.word,undefined,collection?.target_language);
    }
    persistSession(newReviewSession(account, queue,sessionScope));
    setRevealed(null);
    setMessage("");
  }
  useEffect(() => {
    if (!randomMode) { requestedRandom.current = false; return; }
    if (ready && learning.ready && (!supabase || user) && !loadError && words.length && !requestedRandom.current) {
      requestedRandom.current = true;
      let restored: ReviewSession | null = null;
      try { restored = readReviewSession(localStorage.getItem(reviewSessionKey(account,sessionScope)), account,sessionScope); } catch { /* Restricted storage. */ }
      let cancelled=false,finished=false;const local=restored;
      void storedReviewSession(account,sessionScope).catch(()=>null).then(stored=>{if(cancelled)return;finished=true;const best=local?mergeReviewSessions(local,stored):stored;persistSession(best||newReviewSession(account,createReviewQueue(words),sessionScope));});
      return()=>{cancelled=true;if(!finished)requestedRandom.current=false;};
    }
  }, [randomMode, ready, user, loadError, words, account,sessionScope,learning.ready, persistSession]);
  useEffect(() => {
    if (page !== "review") return;
    if (card) void preloadPronunciation(card.word,undefined,collection?.target_language);
    if (randomMode) {
      for (const entry of randomQueue?.filter(entry => !session?.completed.includes(entry.eventId) && entry.id !== card?.id).slice(0, 2) ?? []) {
        const candidate = words.find(word => word.id === entry.id);
        if (candidate) void preloadPronunciation(candidate.word,undefined,collection?.target_language);
      }
    } else {
      for (const candidate of due.slice(1, 3)) void preloadPronunciation(candidate.word,undefined,collection?.target_language);
    }
  }, [page, randomMode, card, randomQueue, randomPosition, words, due, session?.completed,collection?.target_language]);
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
  const voiceIds=page==='library'?displayedWords.filter(w=>itemType(w)==='expression').map(w=>w.id):page==='review'&&card&&itemType(card)==='expression'?[card.id]:[];
  const voiceMetadata=useVoiceNotes(user?.id,voiceIds);
  const dictionarySavedWords=useMemo(()=>words.map(item=>item.word),[words]);
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
    >
      {!supabase && (
        <div className="notice">
          Demo mode · Words stay in this browser.{" "}
          <Link href="/auth">Connect an account</Link> once Supabase is
          configured.
        </div>
      )}
      <LearningHeader title={page==='add'?'Add.':page==='review'?'Review.':'Library.'} legacyTitle={page==='add'?'Add a word.':page==='review'?'Let’s make it stick.':'Library.'} enabled={learning.enabled} collections={learning.collections} active={collection} disabled={busy||!!editing||captureBusy} onSelect={selectCollection}/>
      {page==='library'&&learning.enabled?<Link href={searchParams.get('review')==='random'?'/review?mode=random':'/review'} className="library-back">← Review</Link>:page !== "add" && (
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
          <SelectableLink className={learning.enabled?"library-inline-link":"wb-control wb-control-outline"} selected={page === "library"} href={learning.enabled?`/library?review=${randomMode?'random':'due'}`:"/library"}
            aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault(); else stopPronunciation(); }}>Library</SelectableLink>
        </nav>
      )}
      {offlineNotice&&<Feedback>{offlineNotice}</Feedback>}
      {message && <Feedback>{message}</Feedback>}
      {voiceUploads.filter(upload=>upload.owner===account).map(upload=><div className="wb-feedback" key={upload.draft.id}><p>“{upload.item.word}” is saved. {upload.error}</p><button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await uploadVoice(upload.item.id,upload.draft);setVoiceUploads(previous=>previous.filter(value=>value.draft.id!==upload.draft.id));setMessage('Voice note saved.');}catch(error){setVoiceUploads(previous=>previous.map(value=>value.draft.id===upload.draft.id?{...value,error:voiceError(error)}:value));}finally{setBusy(false)}}}>Retry voice note upload</button><button type="button" className="secondary" disabled={busy} onClick={async()=>{setBusy(true);try{try{await removeVoiceFiles((await voiceFiles([upload.item.id])).filter(file=>file.id===upload.draft.id));}catch(error){const code=(error as {code?:string}).code;if(!['PGRST202','PGRST205'].includes(code||''))throw error;}setVoiceUploads(previous=>previous.filter(value=>value.draft.id!==upload.draft.id));}catch(error){setVoiceUploads(previous=>previous.map(value=>value.draft.id===upload.draft.id?{...value,error:voiceError(error)}:value));}finally{setBusy(false)}}}>Keep Expression without this draft</button></div>)}
      {syncError && <Feedback>Could not refresh. Showing your last loaded items. <button type="button" className="text-button" onClick={() => void load(user, true)}>Retry sync</button></Feedback>}
      {contextMissing?<StatePanel title="Your languages couldn’t be loaded." description="Your Library is safe. Reconnect and try again before choosing a learning language." actionLabel="Try again" onAction={learning.refresh}/> : page === "add" ? (
        <><CollectionAddFlow key={account+':'+(collection?.id||'legacy')} owner={user?.id} collection={collection||undefined} onInteractionBusy={setCaptureBusy}
          busy={busy}
          canSave={ready && learning.ready && (!supabase || !!user)}
          checkingAccount={!ready||!learning.ready}
          library={words}
          onManualSubmit={add}
        /></>
      ) : !ready||!learning.ready ? (
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
            setReady(false);setRefreshed(false);
            void load(user);
          }}
        />
      ) : collection&&typeof navigator!=='undefined'&&!navigator.onLine&&!words.length ? <StatePanel title={`No cached ${learningLanguages[collection.target_language].label} items.`} description="Connect to load this Collection. Your other prepared languages remain available."/> : (
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
                <ImeInput
                  aria-label="Search library"
                  ref={librarySearch}
                  placeholder="Search words or meanings…"
                  value={query} onImeStateChange={setCaptureBusy}
                  onValueChange={(value) => { startTransition(() => { setQuery(value); setLibraryPage(0); }); }}
                />
              </div>
              {learning.enabled&&learning.collections.length>1&&<label className="library-scope">Browse<select aria-label="Library browsing scope" value={allLanguages?'all':'current'} onChange={event=>{setAllLanguages(event.target.value==='all');setLibraryPage(0);}}><option value="current">Current language</option><option value="all">All languages</option></select></label>}
              <div className="library-metadata wb-ui-text">
                <p role="status" aria-label="Library count">{searchPending ? "Searching…" : deferredQuery.trim() ? `${matchingWords.length} ${matchingWords.length === 1 ? "result" : "results"} · ${words.length} total items` : `${visibleWords.length} ${visibleWords.length === 1 ? "item" : "items"}`}</p>
                <span>Words: {wordCount} · Expressions: {words.length - wordCount}</span>
              </div>
              <div className="library-filters" role="group" aria-label="Library content type">
                {([['all', 'All'], ['word', 'Words'], ['expression', 'Expressions']] as const).map(([type, label]) => <SelectableButton key={type} className="secondary" selected={typeFilter === type} onClick={() => { setTypeFilter(type); setLibraryPage(0); }}>{label}</SelectableButton>)}
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
                          <ImeInput
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
                          <ImeTextarea lang="zh-Hans" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                            name="meaning"
                            defaultValue={w.meaning}
                            maxLength={2000}
                          />
                        </label>
                        <label>
                          Example sentence
                          <ImeTextarea
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
                        {allLanguages&&entryCollection(w)&&<small className="wb-ui-text">{learningLanguages[entryCollection(w)!.target_language].label}</small>}
                        {itemType(w)==='expression'?<div className="expression-title"><h2 className="wb-learning-content">{w.word}</h2><WordPronunciation key={w.word} word={w.word} language={entryCollection(w)?.target_language}/></div>:<><h2 className="wb-learning-content">{w.word}</h2><WordPronunciation key={w.word} word={w.word} language={entryCollection(w)?.target_language}/></>}
                        <p className="wb-learning-content">{w.meaning}</p>
                        {itemType(w)==='expression'&&<VoiceManager item={w.id} files={voiceMetadata.files.filter(file=>file.item_id===w.id)} ready={voiceMetadata.ready} error={voiceMetadata.error} onChange={voiceMetadata.refresh}/>}
                        {reviewState(w) && <span className="wb-familiarity wb-ui-text">{reviewState(w)?.last_rating === "sure" ? "Sure" : "Not sure"}</span>}
                        <ContextExample item={w} owner={account} lookup={isOriginalEnglish(entryCollection(w))}/>
                      </div>
                    )}
                    <div className="word-actions">
                      <DictionaryButton onRelatedSave={input=>saveRelated(input,entryCollection(w))} savedWords={collectionItems(allWords,entryCollection(w)||null,true).map(item=>item.word)} word={w.word} meaning={w.meaning} collection={entryCollection(w)} example={w.example} onSaveMeaning={value => saveDictionaryMeaning(w, value)} />
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
                        onClick={() => void requestDelete(w)}
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
              onChange={event => { if (event.target.checked) prepareReviewPronunciation(); setAutoChoice({key:pronunciationKey,enabled:event.target.checked});try{localStorage.setItem(pronunciationKey,event.target.checked?'on':'off');}catch{} }}>
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
                  color={randomMode ? "coral" : collectionColor(card.id)}
                  className="panel review-card wb-learning-card"
                >
                  {randomMode&&<div className="review-card-tools"><button type="button" className="review-delete" aria-label="Delete entry" disabled={busy} onClick={()=>void requestDelete(card)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg></button></div>}
                  <h2 className="wb-learning-content">{prompt}</h2>
                  {(!randomMode || direction === "forward" || revealed === card.id) && (itemType(card)==='expression'?<ExpressionReviewAudio accent={collection?.preferences.accent==='US'?'US':'UK'} language={collection?.target_language} text={card.word} automatic={autoPronunciation&&(refreshed||!supabase||typeof navigator!=='undefined'&&!navigator.onLine)} note={voiceMetadata.files.find(file=>file.item_id===card.id&&file.state==='active'&&file.stored&&!file.preserved_for_word)}/>:<ReviewPronunciation accent={collection?.preferences.accent==='US'?'US':'UK'} language={collection?.target_language} text={card.word} automatic={autoPronunciation&&(refreshed||!supabase||typeof navigator!=='undefined'&&!navigator.onLine)}/>)}
                  {revealed === card.id ? (
                    <>
                      <p className="wb-meaning-reveal wb-learning-content">{direction === "forward" ? card.meaning || 'No meaning saved yet. Open Dictionary to add one.' : card.word}</p>
                      {direction === "context" && <p className="wb-learning-content">{card.meaning}</p>}
                      <ContextExample item={card} owner={account} lookup={isOriginalEnglish(collection)}/>
                      <DictionaryButton onRelatedSave={saveRelated} savedWords={dictionarySavedWords} word={card.word} meaning={card.meaning} example={card.example} collection={collection||undefined} onSaveMeaning={value => saveDictionaryMeaning(card, value)} />
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
      {voiceTypeEdit&&<VoiceConfirm title="Change this Expression to Word?" description="Choose whether to preserve the private recording for when you switch back to Expression, or permanently remove it." busy={busy} confirmLabel="Delete recording and change type" onCancel={()=>setVoiceTypeEdit(null)} preserve={()=>void applyEdit(voiceTypeEdit.word,voiceTypeEdit.changes,true)} onConfirm={()=>void applyEdit(voiceTypeEdit.word,voiceTypeEdit.changes,false,true)}/>}
      {deleting && (
        <ConfirmDialog
          returnFocus={deleteTrigger}
          word={deleting.word}
          entry={page==='review'}
          error={deleteError}
          recordingWarning={deleteHasRecording}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            if(!await remove(deleting.id))return;
            deleteFocusPending.current=true;setDeleting(null);
          }}
        />
      )}
    </AppShell>
  );
}
