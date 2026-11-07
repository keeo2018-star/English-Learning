import { suggestMeaning } from '@/lib/smart-add';
// The dictionary (8s) plus a full-segment translation (7s) fit this bound.
export const maxDuration = 20;
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length')) > 4096) return new Response(null, { status: 413 });
    const body = await request.json();
    if (typeof body.word !== 'string' || body.word.length > 120 || !['auto', 'word', 'expression'].includes(body.type)) return new Response(null, { status: 400 });
    const fetcher: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.any(init?.signal ? [request.signal, init.signal] : [request.signal]) });
    return Response.json(await suggestMeaning(body.word, body.type, fetcher), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ meaning: '', source: null, message: 'Meaning unavailable. You can write your own.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
