import { highlightParts } from '@/lib/highlight';
export function HighlightWord({ text, target }: { text: string; target: string }) {
  return <>{highlightParts(text, target).map((part, index) => part.highlighted
    ? <mark key={index} className="wb-word-highlight wb-learning-content">{part.text}</mark>
    : part.text)}</>;
}
