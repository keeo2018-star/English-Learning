export function VocabularyTitle({ text }: { text: string }) {
  const long = Array.from(text.trim()).length >= 44 || /\S{28,}/u.test(text);
  return <h2 className="wb-vocabulary-title wb-learning-content" data-long={long || undefined}>{text}</h2>;
}
