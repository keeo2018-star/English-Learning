import type { DictionaryResult } from './dictionary';

export const PRONUNCIATION_SETTINGS = Object.freeze({ locale: 'en-GB', rate: 1, pitch: 1, volume: 1 });
export type Accent = 'UK' | 'US';
export type PronunciationStatus = 'idle' | 'loading' | 'playing' | 'blocked' | 'error';
type Phonetics = DictionaryResult['phonetics'];
const cache = new Map<string, { expires: number; value: Promise<Phonetics> }>();
const preparedAudio = new Map<string, HTMLAudioElement>();
const normalizedKey = (text: string) => englishText(text).toLowerCase();
function cleanPhonetics(items: Phonetics): Phonetics {
  return items.filter(item => item && typeof item.accent === 'string').map(item => ({
    accent: item.accent, text: typeof item.text === 'string' ? item.text : '', audio: audioSource(item.audio),
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
    const items = cleanPhonetics(entry.items);
    if (!items.some(item => item.audio)) return;
    resolved.set(key, items);
    cache.set(key, { value: Promise.resolve(items), expires: entry.expires });
    return items;
  } catch { return; }
}
export function rememberPronunciations(text: string, items: Phonetics) {
  const key = normalizedKey(text), value = cleanPhonetics(items);
  if (cache.size >= 100) { const oldest = cache.keys().next().value!; cache.delete(oldest); resolved.delete(oldest); }
  resolved.set(key, value);
  cache.set(key, { value: Promise.resolve(value), expires: Date.now() + 3600000 });
  persistPronunciations();
}
function preferredRecording(items: Phonetics, accent: Accent) {
  return items.find(item => item.accent.toUpperCase() === accent && item.audio)?.audio || items.find(item => item.audio)?.audio;
}
export async function preloadPronunciation(text: string, accent: Accent = 'UK') {
  if (typeof window === 'undefined') return;
  const source = preferredRecording(await getPronunciations(text), accent);
  if (!source || preparedAudio.has(source)) return;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = source;
  // Warm the browser's media cache without playing or holding up the card.
  audio.load();
  preparedAudio.set(source, audio);
  if (preparedAudio.size > 4) {
    const oldest = preparedAudio.keys().next().value!;
    const previous = preparedAudio.get(oldest)!;
    if (current?.audio !== previous) { previous.removeAttribute('src'); previous.load(); }
    preparedAudio.delete(oldest);
  }
}
const voiceChoices = new Map<string, string>();
let voices: SpeechSynthesisVoice[] = [];
let voiceEngine: SpeechSynthesis | undefined;

export const englishText = (text: string) => text.replace(/[^\p{Script=Latin}\x20-\x7E]/gu, ' ').replace(/\s+/g, ' ').trim();
export const speechSupported = () => typeof window !== 'undefined' &&
  typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
export const pronunciationSupported = () => typeof window !== 'undefined' && (typeof window.Audio === 'function' || speechSupported());
function audioSource(value: string | undefined | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'uapis.cn' && !url.username && !url.password &&
      url.pathname === '/api/v1/dictionary/audio' ? url.href : undefined;
  } catch { return undefined; }
}
export function getPronunciations(text: string): Promise<Phonetics> {
  const key = normalizedKey(text);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  if (storedPronunciations(key)) return cache.get(key)!.value;
  resolved.delete(key);
  const value = (async () => {
    try {
      const response = await fetch('/api/dictionary?' + new URLSearchParams({ word: key, pronunciation: '1' }), { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return [];
      const data = await response.json();
      if (!Array.isArray(data.phonetics)) return [];
      const items = cleanPhonetics(data.phonetics);
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
    voices = synth.getVoices();
    // Do not overwrite other consumers' onvoiceschanged handlers.
    synth.addEventListener('voiceschanged', () => { voices = synth.getVoices(); });
  } else voices = synth.getVoices();
  return voices;
}
export function selectEnglishVoice(catalog: SpeechSynthesisVoice[], locale: string) {
  const english = catalog.filter(voice => /^en(?:-|$)/i.test(voice.lang.replaceAll('_', '-')));
  const pinned = voiceChoices.get(locale);
  const saved = english.find(voice => (voice.voiceURI || voice.name) === pinned);
  if (saved) return saved;
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

type Request = { owner: symbol; audio: HTMLAudioElement; cleanups: (() => void)[]; report: (status: PronunciationStatus) => void; speech?: SpeechSynthesisUtterance; retry?: () => void };
let current: Request | undefined;
let reviewAudio: HTMLAudioElement | undefined;
let reviewAutoplayBlocked = false;
export function resumePronunciation(owner: symbol) {
  if (current?.owner === owner) current.retry?.();
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
  request.cleanups.splice(0).forEach(cleanup => cleanup());
  request.report(status);
}
async function speak(request: Request, text: string, accent: Accent) {
  if (!active(request)) return;
  if (!speechSupported()) { finish(request, 'error'); return; }
  const synth = window.speechSynthesis;
  // If voices are still loading, let the engine honor the English locale
  // immediately rather than imposing an extra fallback-only waiting period.
  if (!active(request)) return;
  const locale = accent === 'US' ? 'en-US' : PRONUNCIATION_SETTINGS.locale;
  const voice = selectEnglishVoice(voiceCatalog(), locale);
  const utterance = new SpeechSynthesisUtterance(text);
  request.speech = utterance;
  utterance.lang = voice?.lang || locale;
  if (voice) utterance.voice = voice;
  utterance.rate = PRONUNCIATION_SETTINGS.rate;
  utterance.pitch = PRONUNCIATION_SETTINGS.pitch;
  utterance.volume = PRONUNCIATION_SETTINGS.volume;
  utterance.onend = () => finish(request, 'idle');
  utterance.onerror = event => {
    if (!active(request)) return;
    if (event.error === 'not-allowed') {
      request.retry = () => { request.retry = undefined; void speak(request, text, accent); };
      request.report('blocked');
    } else finish(request, event.error === 'canceled' || event.error === 'interrupted' ? 'idle' : 'error');
  };
  try { request.report('playing'); synth.speak(utterance); }
  catch { finish(request, 'error'); }
}
export async function pronounce({ owner, text, accent = 'UK', recording, audio, report, automatic = false }: {
  owner: symbol; text: string; accent?: Accent; recording?: string | null;
  audio: HTMLAudioElement; report: (status: PronunciationStatus) => void; automatic?: boolean;
}) {
  stopPronunciation();
  const title = englishText(text);
  if (!/\p{Script=Latin}/u.test(title)) return;
  const request: Request = { owner, audio, report, cleanups: [] };
  current = request;
  report('loading');
  let source = audioSource(recording);
  if (!source) {
    const key = normalizedKey(title);
    const stored = cache.get(key);
    const items = stored && stored.expires > Date.now() ? resolved.get(key) : undefined;
    source = preferredRecording(items ?? await getPronunciations(title), accent);
  }
  if (!active(request)) return;
  if (!source) { await speak(request, title, accent); return; }
  // Reuse one review player across cards: iOS grants playback to media elements,
  // not to every newly-created preloader. Upcoming recordings warm the HTTP cache.
  const sharedReview = recording === undefined;
  if (sharedReview) audio = reviewAudio ??= audio;
  request.audio = audio;
  let fallbackStarted = false;
  const remove = () => { audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed); };
  const ended = () => { if (!fallbackStarted) finish(request, 'idle'); };
  const failed = () => {
    if (fallbackStarted || !active(request)) return;
    fallbackStarted = true;
    remove(); audio.pause();
    void speak(request, title, accent);
  };
  audio.addEventListener('ended', ended);
  audio.addEventListener('error', failed);
  request.cleanups.push(remove);
  if (audio.src !== source) { audio.preload = 'auto'; audio.src = source; }
  audio.currentTime = 0;
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
    void playback.then(() => {
      if (!active(request) || fallbackStarted) return;
      if (sharedReview) reviewAutoplayBlocked = false;
      report('playing');
    }, rejected);
  };
  const rejected = (error: unknown) => {
    if (!active(request)) return;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      if (sharedReview) reviewAutoplayBlocked = true;
      request.retry = playRecording;
      report('blocked');
    } else failed();
  };
  if (automatic && sharedReview && reviewAutoplayBlocked) {
    request.retry = playRecording;
    report('blocked');
  } else playRecording();
}
