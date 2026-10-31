import type { DictionaryResult } from './dictionary';

export const PRONUNCIATION_SETTINGS = Object.freeze({ locale: 'en-GB', rate: 1, pitch: 1, volume: 1 });
export type Accent = 'UK' | 'US';
export type PronunciationStatus = 'idle' | 'loading' | 'playing' | 'error';
type Phonetics = DictionaryResult['phonetics'];
const cache = new Map<string, { expires: number; value: Promise<Phonetics> }>();
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
  const key = englishText(text).toLowerCase();
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  const value = (async () => {
    try {
      const response = await fetch('/api/dictionary?' + new URLSearchParams({ word: key, pronunciation: '1' }), { signal: AbortSignal.timeout(8000) });
      if (!response.ok) { cache.delete(key); return []; }
      const data = await response.json();
      if (!Array.isArray(data.phonetics)) { cache.delete(key); return []; }
      return data.phonetics.filter((item: Phonetics[number]) => item && typeof item.accent === 'string').map((item: Phonetics[number]) => ({
        accent: item.accent, text: typeof item.text === 'string' ? item.text : '', audio: audioSource(item.audio),
      }));
    } catch { cache.delete(key); return []; }
  })();
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
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

type Request = { owner: symbol; audio: HTMLAudioElement; cleanups: (() => void)[]; report: (status: PronunciationStatus) => void; speech?: SpeechSynthesisUtterance };
let current: Request | undefined;
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
  if (!voiceCatalog().some(voice => /^en(?:-|$)/i.test(voice.lang.replaceAll('_', '-')))) await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); synth.removeEventListener('voiceschanged', done); resolve(); };
    const timer = setTimeout(done, 500);
    synth.addEventListener('voiceschanged', done);
    request.cleanups.push(done);
  });
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
  utterance.onerror = event => finish(request, event.error === 'canceled' || event.error === 'interrupted' ? 'idle' : 'error');
  try { request.report('playing'); synth.speak(utterance); }
  catch { finish(request, 'error'); }
}
export async function pronounce({ owner, text, accent = 'UK', recording, audio, report }: {
  owner: symbol; text: string; accent?: Accent; recording?: string | null;
  audio: HTMLAudioElement; report: (status: PronunciationStatus) => void;
}) {
  stopPronunciation();
  const title = englishText(text);
  if (!/\p{Script=Latin}/u.test(title)) return;
  const request: Request = { owner, audio, report, cleanups: [] };
  current = request;
  report('loading');
  let source = audioSource(recording);
  if (recording === undefined) source = (await getPronunciations(title)).find(item => item.accent.toUpperCase() === accent)?.audio;
  if (!active(request)) return;
  if (!source) { await speak(request, title, accent); return; }
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
  audio.src = source;
  audio.currentTime = 0;
  audio.playbackRate = PRONUNCIATION_SETTINGS.rate;
  audio.preservesPitch = true;
  audio.volume = PRONUNCIATION_SETTINGS.volume;
  try {
    await audio.play();
    if (active(request) && !fallbackStarted) report('playing');
  } catch { failed(); }
}
