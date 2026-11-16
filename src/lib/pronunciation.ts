import { audioSource } from './audio-source';
import { pauseContextVideos } from './learning-media';
import { spokenEnglish,pronunciationKey,validateDictionaryWord, type DictionaryResult } from './dictionary';

export const PRONUNCIATION_SETTINGS = Object.freeze({ locale: 'en-GB', rate: 1, pitch: 1, volume: 1 });
export type Accent = 'UK' | 'US';
export type PronunciationStatus = 'idle' | 'loading' | 'playing' | 'blocked' | 'error';
type Phonetics = DictionaryResult['phonetics'];
const cache = new Map<string, { expires: number; value: Promise<Phonetics> }>();
const normalizedKey = pronunciationKey;
function officialRecording(text:string,accent:Accent){try{return 'https://uapis.cn/api/v1/dictionary/audio?'+new URLSearchParams({accent:accent.toLowerCase(),word:validateDictionaryWord(normalizedKey(text))});}catch{return undefined;}}
function completeRecording(value:string|undefined|null,text:string){const source=audioSource(value);return source&&normalizedKey(new URL(source).searchParams.get('word')||'')===normalizedKey(text)?source:undefined;}
function cleanPhonetics(items: Phonetics,text?:string): Phonetics {
  return items.filter(item => item && typeof item.accent === 'string').map(item => ({
    accent: item.accent, text: typeof item.text === 'string' ? item.text : '', audio: text===undefined?audioSource(item.audio):completeRecording(item.audio,text),
  }));
}
const resolved = new Map<string, Phonetics>();
const STORAGE_KEY = 'noted-pronunciations-v1';
function persistPronunciations() {
  try {
    const entries = [...resolved].flatMap(([key, items]) => {
      const entry = cache.get(key);
      return entry && entry.expires > Date.now() && items.some(item => item.audio)
        ? [{ key, expires: entry.expires, items }] : [];
    }).slice(-100);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch { /* Restricted browser storage must not prevent pronunciation. */ }
}
function storedPronunciations(key: string): Phonetics | undefined {
  try {
    const entries = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(entries)) return;
    const entry = entries.slice(-100).find(item => item?.key === key && typeof item.expires === 'number' && item.expires > Date.now() && Array.isArray(item.items));
    if (!entry) return;
    const items = cleanPhonetics(entry.items,key);
    if (!items.some(item => item.audio)) return;
    resolved.set(key, items);
    cache.set(key, { value: Promise.resolve(items), expires: entry.expires });
    return items;
  } catch { return; }
}
export function rememberPronunciations(text: string, items: Phonetics) {
  const key = normalizedKey(text), value = cleanPhonetics(items,text);
  if (cache.size >= 100) { const oldest = cache.keys().next().value!; cache.delete(oldest); resolved.delete(oldest); }
  resolved.set(key, value);
  cache.set(key, { value: Promise.resolve(value), expires: Date.now() + 3600000 });
  persistPronunciations();
}
function preferredRecording(items: Phonetics, accent: Accent) {
  return items.find(item => item.accent.toUpperCase() === accent && item.audio)?.audio || items.find(item => item.audio)?.audio;
}
const recordingFiles = new Map<string, Promise<string | undefined>>();
const retiredFiles = new Set<string>();
const readyFiles=new Map<string,string>();
const unavailableCandidates=new Map<string,number>();
function unavailableCandidate(source:string){if(unavailableCandidates.size>=100)unavailableCandidates.delete(unavailableCandidates.keys().next().value!);unavailableCandidates.set(source,Date.now()+30000);}
function releaseRecordingFiles() {
  for (const url of retiredFiles) {
    if (reviewAudio?.src !== url && current?.audio.src !== url) { URL.revokeObjectURL(url); retiredFiles.delete(url); }
  }
}
function recordingFile(source: string,timeout=14000): Promise<string | undefined> {
  const existing = recordingFiles.get(source);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const response = await fetch('/api/pronunciation?' + new URLSearchParams({ source }), { cache: 'force-cache', signal: AbortSignal.timeout(timeout) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/')) return;
      const blob = await response.blob();
      if (!blob.size || blob.size > 2 * 1024 * 1024) return;
      return URL.createObjectURL(blob);
    } catch { return; }
  })();
  recordingFiles.set(source, pending);
  void pending.then(url => { if(recordingFiles.get(source)!==pending)return;if(url)readyFiles.set(source,url);else recordingFiles.delete(source); });
  while (recordingFiles.size > 4) {
    const oldest = recordingFiles.keys().next().value!;
    const previous = recordingFiles.get(oldest)!;
    recordingFiles.delete(oldest);readyFiles.delete(oldest);
    void previous.then(url => { if (url) { retiredFiles.add(url); releaseRecordingFiles(); } });
  }
  return pending;
}
function discardRecording(source: string) {
  const pending = recordingFiles.get(source);
  if (!pending) return;
  recordingFiles.delete(source);readyFiles.delete(source);
  void pending.then(url => { if (url) { retiredFiles.add(url); releaseRecordingFiles(); } });
}
export async function preloadPronunciation(text: string, accent: Accent = 'UK') {
  if (typeof window === 'undefined') return;
  const key = normalizedKey(text);
  const known = cache.get(key);
  const metadata = known && known.expires > Date.now() ? resolved.get(key) : storedPronunciations(key);
  // For a simple English word, download the provider's fixed recording URL in
  // parallel with lookup. Playback still requires usable metadata or a verified proxy response.
  const speculative = metadata === undefined && /^[a-z]+(?:['’-][a-z]+)*$/i.test(key)
    ? 'https://uapis.cn/api/v1/dictionary/audio?' + new URLSearchParams({ accent: accent.toLowerCase(), word: key }) : undefined;
  if (speculative) void recordingFile(speculative);
  const phonetics = metadata ?? await getPronunciations(text);
  const knownSource=preferredRecording(phonetics,accent),source=knownSource||officialRecording(text,accent);
  if(speculative&&source!==speculative)discardRecording(speculative);
  if(source&&(unavailableCandidates.get(source)||0)<=Date.now()){
   const file=await recordingFile(source,knownSource?14000:6000);if(!file&&!knownSource)unavailableCandidate(source);
  }
}
const voiceChoices = new Map<string, string>();
let voices: SpeechSynthesisVoice[] = [];
let voiceEngine: SpeechSynthesis | undefined;

export const englishText = spokenEnglish;
export const speechSupported = () => typeof window !== 'undefined' &&
  typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
export const pronunciationSupported = () => typeof window !== 'undefined' && (typeof window.Audio === 'function' || speechSupported());
export function getPronunciations(text: string): Promise<Phonetics> {
  const key = normalizedKey(text);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  if (storedPronunciations(key)) return cache.get(key)!.value;
  try { validateDictionaryWord(key); } catch { return Promise.resolve([]); }
  resolved.delete(key);
  const value = (async () => {
    try {
      const response = await fetch('/api/dictionary?' + new URLSearchParams({ word: key, pronunciation: '1' }), { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return [];
      const data = await response.json();
      if (!Array.isArray(data.phonetics)) return [];
      const items = cleanPhonetics(data.phonetics,key);
      return items;
    } catch { return []; }
  })().then(items => {
    if (cache.get(key)?.value === value) { resolved.set(key, items); persistPronunciations(); }
    // Transient lookup failures can recover; do not pin them for an hour.
    if (!items.length) {
      const entry = cache.get(key);
      if (entry?.value === value) entry.expires = Date.now() + 30000;
    }
    return items;
  });
  if (cache.size >= 100) { const oldest = cache.keys().next().value!; cache.delete(oldest); resolved.delete(oldest); }
  cache.set(key, { value, expires: Date.now() + 3600000 });
  return value;
}
function voiceCatalog() {
  const synth = window.speechSynthesis;
  if (voiceEngine !== synth) {
    voiceEngine = synth;
    try{voices = synth.getVoices();}catch{voices=[];}
    // Do not overwrite other consumers' onvoiceschanged handlers.
    synth.addEventListener('voiceschanged', () => { try{voices = synth.getVoices();}catch{voices=[];} });
  } else try{voices = synth.getVoices();}catch{voices=[];}
  return voices;
}
export function selectEnglishVoice(catalog: SpeechSynthesisVoice[], locale: string) {
  const english = catalog.filter(voice => /^en(?:-|$)/i.test(voice.lang.replaceAll('_', '-')));
  const pinned = voiceChoices.get(locale);
  const saved = english.find(voice => (voice.voiceURI || voice.name) === pinned);
  const matchesLocale=(voice:SpeechSynthesisVoice)=>voice.lang.toLowerCase().replaceAll('_','-')===locale.toLowerCase();
  if(saved&&(matchesLocale(saved)||!english.some(matchesLocale)))return saved;
  const names = ['google uk english female', 'microsoft sonia', 'microsoft libby', 'serena', 'kate', 'susan', 'hazel', 'fiona', 'samantha'];
  const rank = (voice: SpeechSynthesisVoice) => {
    const name = voice.name.toLowerCase();
    const preferred = names.findIndex(value => name.includes(value));
    return [voice.lang.toLowerCase().replaceAll('_', '-') === locale.toLowerCase() ? 0 : 1,
      preferred < 0 ? names.length : preferred];
  };
  english.sort((left, right) => {
    const a = rank(left), b = rank(right);
    return a[0] - b[0] || a[1] - b[1] || left.name.localeCompare(right.name) || (left.voiceURI || left.name).localeCompare(right.voiceURI || right.name);
  });
  const selected = english[0];
  if (selected) voiceChoices.set(locale, selected.voiceURI || selected.name);
  return selected;
}

type Request = { automatic?:boolean;kind?: 'voice'; owner: symbol; audio: HTMLAudioElement; cleanups: (() => void)[]; report: (status: PronunciationStatus) => void; speech?: SpeechSynthesisUtterance; retry?: () => void };
let current: Request | undefined;
let reviewAudio: HTMLAudioElement | undefined;
let reviewAutoplayBlocked = false;
let reviewPlaybackUnlocked = false;
let unlocking: Promise<void> | undefined;
const SILENT_RECORDING = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
// Run directly in a navigation/toggle/speaker gesture, before async lookup.
export function prepareReviewPronunciation(retryCurrent=true) {
  if(retryCurrent&&current?.retry&&current.kind!=='voice'){current.retry();return;}
  if (typeof window === 'undefined' || typeof Audio !== 'function' || reviewPlaybackUnlocked || unlocking) return;
  const audio = reviewAudio ??= new Audio();
  if (current?.audio === audio) return;
  audio.src = SILENT_RECORDING;
  try {
    unlocking = audio.play().then(() => {
      if (audio.src === SILENT_RECORDING) audio.pause();
      reviewPlaybackUnlocked = true;
      reviewAutoplayBlocked = false;
    }, () => {}).finally(() => { unlocking = undefined; });
  } catch { /* The normal manual/reveal recovery remains available. */ }
}
export function resumePronunciation(owner: symbol) {
  if (current?.owner !== owner || !current.retry) return false;
  current.retry();
  return true;
}
function active(request: Request) { return current === request; }
export function stopPronunciation(owner?: symbol) {
  if (owner && current?.owner !== owner) return;
  const previous = current;
  current = undefined;
  if (previous) {
    previous.cleanups.splice(0).forEach(cleanup => cleanup());
    previous.audio.pause();
    previous.report('idle');
  }
  if (speechSupported()) window.speechSynthesis.cancel();
}
function finish(request: Request, status: PronunciationStatus) {
  if (!active(request)) return;
  current = undefined;
  if(status==='error'){request.audio.pause();if(request.speech&&speechSupported())window.speechSynthesis.cancel();}
  request.cleanups.splice(0).forEach(cleanup => cleanup());
  request.report(status);
}
async function speak(request: Request, text: string, accent: Accent) {
  if(!active(request))return;
  if(!speechSupported()){finish(request,'error');return;}
  const synth=window.speechSynthesis,locale=accent==='US'?'en-US':PRONUNCIATION_SETTINGS.locale;
  let attempts=0,started=false,permissionBlocked=false,timer:ReturnType<typeof setTimeout>|undefined;
  const tried=new Set<string>();
  const identity=(voice:SpeechSynthesisVoice)=>voice.voiceURI||voice.name||voice.lang;
  const nextVoice=()=>selectEnglishVoice(voiceCatalog().filter(v=>!tried.has(identity(v))),locale);
  const blocked=()=>{clearTimeout(timer);if(!active(request))return;permissionBlocked=true;request.speech=undefined;try{synth.cancel();}catch{}request.retry=()=>{request.retry=undefined;void speak(request,text,accent)};request.report('blocked');};
  const launch=(voice?:SpeechSynthesisVoice)=>{
    if(!active(request))return;clearTimeout(timer);attempts++;started=false;
    // Cancel a stalled queued utterance before retrying; its callbacks cannot end this attempt.
    request.speech=undefined;try{synth.cancel();if(synth.paused)synth.resume();}catch{/* speak/error handling below remains authoritative. */}
    const utterance=new SpeechSynthesisUtterance(text);request.speech=utterance;
    if(voice){tried.add(identity(voice));utterance.voice=voice;}
    utterance.lang=voice?.lang.replaceAll('_','-')||locale;utterance.rate=PRONUNCIATION_SETTINGS.rate;utterance.pitch=PRONUNCIATION_SETTINGS.pitch;utterance.volume=PRONUNCIATION_SETTINGS.volume;
    const valid=()=>active(request)&&request.speech===utterance;
    const began=()=>{if(!valid())return;started=true;request.retry=undefined;clearTimeout(timer);request.report('playing');};
    utterance.onstart=began;
    utterance.onend=()=>{if(valid())finish(request,started?'idle':'error');};
    utterance.onerror=event=>{if(!valid())return;clearTimeout(timer);if(event.error==='not-allowed'){blocked();return;}
      const retryable=['voice-unavailable','language-unavailable','synthesis-failed'].includes(event.error),alternative=nextVoice();
      if(!started&&attempts<2&&alternative&&retryable)launch(alternative);
      else if(!started&&attempts<2&&retryable&&!voiceCatalog().some(v=>/^en(?:[-_]|$)/i.test(v.lang))){
        request.speech=undefined;request.report('loading');timer=setTimeout(()=>{if(!active(request))return;const loaded=nextVoice();if(loaded)launch(loaded);else finish(request,'error');},1800);
      }else finish(request,'error');
    };
    request.report('loading');
    try{synth.speak(utterance);}catch(error){if((error as {name?:string}).name==='NotAllowedError')blocked();else finish(request,'error');return;}
    if(!valid()||started)return;
    timer=setTimeout(()=>{if(!valid()||started)return;if(synth.speaking){began();return;}
      const alternative=nextVoice();if(attempts<2&&alternative)launch(alternative);else if(request.automatic)blocked();else finish(request,'error');
    },1800);
  };
  const changed=()=>{if(!active(request)||permissionBlocked||started||attempts>=2)return;if(synth.speaking)return;const candidate=nextVoice();if(candidate)launch(candidate);};
  synth.addEventListener('voiceschanged',changed);request.cleanups.push(()=>{clearTimeout(timer);synth.removeEventListener('voiceschanged',changed);});
  launch(selectEnglishVoice(voiceCatalog(),locale));
}
export async function pronounce({ owner, text, accent = 'UK', recording, audio, report, automatic = false }: {
  owner: symbol; text: string; accent?: Accent; recording?: string | null;
  audio: HTMLAudioElement; report: (status: PronunciationStatus) => void; automatic?: boolean;
}) {
  pauseContextVideos();
  stopPronunciation();
  const title = englishText(text);
  if (!/\p{Script=Latin}/u.test(title)) return;
  const request: Request = { owner, audio, report, automatic,cleanups: [] };
  current = request;
  report('loading');
  let source = completeRecording(recording,title);
  let candidate=false;
  if (!source) {
    const key = normalizedKey(title);
    const stored = cache.get(key);
    const items = stored && stored.expires > Date.now() ? resolved.get(key) : undefined;
    source = preferredRecording(items ?? await getPronunciations(title), accent);
  }
  if (!active(request)) return;
  if(!source){source=officialRecording(title,accent);candidate=!!source;}
  if(!source||(candidate&&(unavailableCandidates.get(source)||0)>Date.now())){await speak(request,title,accent);return;}
  // Reuse one review player across cards: iOS grants playback to media elements,
  // not to every newly-created preloader. Upcoming recordings warm the HTTP cache.
  const sharedReview = recording === undefined || candidate;
  if (sharedReview) audio = reviewAudio ??= audio;
  request.audio = audio;
  if (sharedReview && unlocking) await unlocking;
  if (!active(request)) return;
  const prepared=readyFiles.get(source);
  const playableSource=prepared||(sharedReview||candidate?await recordingFile(source,candidate?6000:14000):source)||(!candidate?source:undefined);
  if(!playableSource){if(candidate)unavailableCandidate(source);if(active(request))await speak(request,title,accent);return;}
  if (!active(request)) return;
  let fallbackStarted = false;
  let startTimer:ReturnType<typeof setTimeout>|undefined;
  const remove = () => { clearTimeout(startTimer);audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed); };
  const ended = () => { if (!fallbackStarted) finish(request, 'idle'); };
  const failed = () => {
    if (fallbackStarted || !active(request)) return;
    fallbackStarted = true;
    remove(); audio.pause();discardRecording(source!);if(candidate)unavailableCandidate(source!);
    void speak(request, title, accent);
  };
  audio.addEventListener('ended', ended);
  audio.addEventListener('error', failed);
  request.cleanups.push(remove);
  if (audio.src !== playableSource) { audio.preload = 'auto'; audio.src = playableSource; }
  releaseRecordingFiles();
  try{audio.currentTime = 0;}catch{/* Fresh iOS media elements may not be seekable until metadata arrives. */}
  audio.playbackRate = PRONUNCIATION_SETTINGS.rate;
  audio.preservesPitch = true;
  audio.volume = PRONUNCIATION_SETTINGS.volume;
  const playRecording = () => {
    if (!active(request)) return;
    request.retry = undefined;
    report('loading');
    // Call play synchronously so a trusted gesture is still active on iOS.
    let playback: Promise<void>;
    try { playback = audio.play(); }
    catch (error) { rejected(error); return; }
    startTimer=setTimeout(failed,5000);
    void playback.then(() => {
      clearTimeout(startTimer);
      if (!active(request) || fallbackStarted) return;
      if (sharedReview) { reviewAutoplayBlocked = false; reviewPlaybackUnlocked = true; }
      report('playing');
    }, rejected);
  };
  const rejected = (error: unknown) => {
    clearTimeout(startTimer);if (!active(request)) return;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      if (sharedReview) { reviewAutoplayBlocked = true; reviewPlaybackUnlocked = false; }
      request.retry = playRecording;
      report('blocked');
    } else failed();
  };
  if (automatic && sharedReview && reviewAutoplayBlocked) {
    request.retry = playRecording;
    report('blocked');
  } else playRecording();
}

// Private notes and previews use the same ownership/request token as dictionary
// recordings and TTS. No independent playback controller can overlap them.
export function claimVoiceAudio(owner: symbol, audio: HTMLAudioElement, report: (status: PronunciationStatus) => void) {
  if (current?.owner === owner) return current;
  pauseContextVideos(); stopPronunciation();
  const request: Request = { kind: 'voice', owner, audio, report, cleanups: [] };
  current = request;
  const ended = () => finish(request, 'idle');
  const failed = () => finish(request, 'error');
  audio.addEventListener('ended', ended); audio.addEventListener('error', failed);
  request.cleanups.push(() => { audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed); });
  return request;
}
export async function playVoiceAudio({ owner, audio, source, report, onReady }: {
  owner: symbol; audio: HTMLAudioElement; source: () => Promise<string>; report: (status: PronunciationStatus) => void; onReady?: () => void;
}) {
  const request = claimVoiceAudio(owner, audio, report);
  report('loading');
  try {
    const url = await source();
    if (!active(request)) return;
    if (audio.src !== url) { audio.preload = 'none'; audio.src = url; }
    onReady?.();
    const play = () => {
      if (!active(request)) return;
      request.retry = undefined;
      void audio.play().then(() => { if (active(request)) report('playing'); }, error => {
        if (!active(request)) return;
        if (error instanceof DOMException && error.name === 'NotAllowedError') { request.retry = play; report('blocked'); }
        else finish(request, 'error');
      });
    };
    play();
  } catch { if (active(request)) finish(request, 'error'); }
}
