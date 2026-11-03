import { audioSource } from '@/lib/audio-source';
const LIMIT = 2 * 1024 * 1024;
export async function GET(request: Request) {
  const source = audioSource(new URL(request.url).searchParams.get('source'));
  if (!source) return new Response('Invalid pronunciation source.', { status: 400 });
  try {
    const response = await fetch(source, { headers: { Accept: 'audio/*' }, redirect: 'error', signal: AbortSignal.timeout(12000) });
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
    if (!response.ok || !type.startsWith('audio/') || Number(response.headers.get('content-length')) > LIMIT || !response.body) {
      await response.body?.cancel();
      return new Response('Recording unavailable.', { status: 502 });
    }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); return new Response('Recording too large.', { status: 502 }); }
      chunks.push(value);
    }
    if (!size) return new Response('Recording unavailable.', { status: 502 });
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, { headers: { 'Content-Type': type, 'Content-Length': String(size), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' } });
  } catch { return new Response('Recording unavailable.', { status: 502 }); }
}
