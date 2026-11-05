/** Only the documented official widget API; no result scraping or transcript storage. */
export const YOUGLISH_SCRIPT = 'https://youglish.com/public/emb/widget.js';
export type VideoAccent = 'uk' | 'us';
type WidgetEvent = { totalResult?: number; state?: number; code?: number };
type Widget = {
  fetch(query: string, language: string, accent: string): void;
  pause(): void;
  replay(): void;
  next(): void;
  close(): void;
  removeEventListener(event: string, listener: (event: WidgetEvent) => void): void;
};
type WidgetAPI = { Widget: new (host: HTMLElement, options: Record<string, unknown>) => Widget };
declare global {
  interface Window { YG?: WidgetAPI; onYouglishAPIReady?: () => void }
}
let loading: Promise<WidgetAPI> | undefined;
function loadWidget(): Promise<WidgetAPI> {
  if (window.YG) return Promise.resolve(window.YG);
  if (loading) return loading;
  loading = new Promise<WidgetAPI>((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouglishAPIReady;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onerror = null;
      window.onYouglishAPIReady = previous;
      if (error || !window.YG) { script.remove(); reject(error || new Error('Unavailable')); }
      else resolve(window.YG);
    };
    const timer = setTimeout(() => finish(new Error('Timeout')), 15000);
    window.onYouglishAPIReady = () => { finish(); previous?.(); };
    script.src = YOUGLISH_SCRIPT;
    script.async = true;
    script.onerror = () => finish(new Error('Network'));
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
export function officialContextUrl(query: string, accent: VideoAccent = 'uk') {
  return `https://youglish.com/pronounce/${encodeURIComponent(query)}/english/${accent}`;
}
export type ContextPlayer = { pause(): void; replay(): void; next(): void; dispose(): void };
export async function createContextPlayer(host: HTMLElement, query: string, accent: VideoAccent, callbacks: {
  results(count: number): void; ready(): void; playing(): void; error(): void;
}, signal: AbortSignal): Promise<ContextPlayer | undefined> {
  const api = await loadWidget();
  if (signal.aborted) return;
  let disposed = false;
  const events = {
    onFetchDone: (event: WidgetEvent) => { if (!disposed) callbacks.results(Number(event.totalResult) || 0); },
    onPlayerReady: () => { if (!disposed) callbacks.ready(); },
    onPlayerStateChange: (event: WidgetEvent) => { if (!disposed && event.state === 1) callbacks.playing(); },
    onError: () => { if (!disposed) callbacks.error(); },
  };
  const widget = new api.Widget(host, {
    autoStart: 0,
    // Caption, title, speed and official controls. Preserve provider attribution/ads.
    components: 4 + 8 + 16 + 64,
    backgroundColor: '#f5f4ef', textColor: '#161616', linkColor: '#161616',
    captionColor: '#161616', markerColor: '#c1ff32', captionSize: 20,
    videoQuality: 'default', events,
  });
  const player: ContextPlayer = {
    pause: () => { if (!disposed) { try { widget.pause(); } catch { /* A failed frame must not block word audio. */ } } },
    replay: () => { if (!disposed) widget.replay(); },
    next: () => { if (!disposed) widget.next(); },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      // close is the documented cleanup method (there is no documented destroy).
      try { widget.pause(); } catch { /* The iframe may already be gone. */ }
      for (const [event, listener] of Object.entries(events)) widget.removeEventListener(event, listener);
      try { widget.close(); } catch { /* React may already have removed the host. */ }
    },
  };
  signal.addEventListener('abort', player.dispose, { once: true });
  try { widget.fetch(query, 'english', accent); }
  catch (error) { player.dispose(); throw error; }
  return player;
}
