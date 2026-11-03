// Only dictionary-provided recordings on this fixed endpoint may be proxied.
export function audioSource(value: string | undefined | null): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://uapis.cn' || url.username || url.password || url.hash || url.pathname !== '/api/v1/dictionary/audio') return;
    const word = url.searchParams.get('word') || '';
    const accent = url.searchParams.get('accent');
    if (!/^[a-zA-Z][a-zA-Z'’ -]*$/.test(word) || word.length > 120 || !['uk', 'us'].includes(accent || '')) return;
    if ([...url.searchParams.keys()].some(key => !['word', 'accent'].includes(key)) || url.searchParams.getAll('word').length !== 1 || url.searchParams.getAll('accent').length !== 1) return;
    return url.href;
  } catch { return; }
}
