import { languageIdentity } from '@/lib/language-colors';

export function LanguageMark({ language, dot = false }: { language: string; dot?: boolean }) {
  const identity = languageIdentity(language);
  return <span className={dot ? 'wb-language-dot' : 'wb-language-mark'} aria-hidden="true"
    style={{ backgroundColor: identity.color }}>{dot ? null : identity.code}</span>;
}
