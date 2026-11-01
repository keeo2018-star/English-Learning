export type HighlightPart = { text: string; highlighted: boolean };
export function highlightParts(text: string, target: string): HighlightPart[] {
  const phrase = target.trim();
  if (!phrase) return [{ text, highlighted: false }];
  const escaped = phrase.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const pattern = new RegExp(escaped, 'giu');
  const wordCharacter = /[\p{L}\p{M}\p{N}_]/u;
  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!, end = start + match[0].length;
    const before = Array.from(text.slice(0, start)).at(-1) || '';
    const after = Array.from(text.slice(end))[0] || '';
    if (wordCharacter.test(before) || wordCharacter.test(after)) continue;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), highlighted: false });
    parts.push({ text: match[0], highlighted: true });
    cursor = end;
  }
  if (cursor < text.length || !parts.length) parts.push({ text: text.slice(cursor), highlighted: false });
  return parts;
}
