import { highlightParts } from '@/lib/highlight';

export function HighlightWord({ text, target, surface, language }: { text: string; target: string; surface?: string; language?: string }) {
  return <>{highlightParts(text, surface || target, { exact: Boolean(surface), language }).map((part, index) => part.highlighted
    ? <mark key={index} className="wb-word-highlight wb-learning-content">{part.text}</mark>
    : part.text)}</>;
}
