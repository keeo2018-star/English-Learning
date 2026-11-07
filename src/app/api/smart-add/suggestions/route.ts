import { suggestEnglish } from '@/lib/smart-add';
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') || '';
  if (query.length > 120) return Response.json({ suggestions: [] }, { status: 400 });
  const fetcher: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.any(init?.signal ? [request.signal, init.signal] : [request.signal]) });
  try { return Response.json({ suggestions: await suggestEnglish(query, fetcher) }, { headers: { 'Cache-Control': 'private, max-age=300' } }); }
  catch { return Response.json({ suggestions: [], message: 'Suggestions unavailable. Keep typing your own text.' }, { status: 503 }); }
}
