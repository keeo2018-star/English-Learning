const languages = {
  en: { color: '#C6B4F7', code: 'EN' },
  fr: { color: '#B5D4F4', code: 'FR' },
  es: { color: '#F6C2A5', code: 'ES' },
  'zh-cn': { color: '#F0DF9D', code: 'ZH' },
} as const;

const aliases: Record<string, keyof typeof languages> = {
  english: 'en', french: 'fr', spanish: 'es', chinese: 'zh-cn', 'simplified chinese': 'zh-cn',
  zh: 'zh-cn', 'zh-hans': 'zh-cn',
};

export function languageIdentity(value: string) {
  const key = value.trim().toLowerCase().replaceAll('_', '-');
  const canonical = aliases[key] ?? (Object.hasOwn(languages, key) ? key : key.split('-')[0]);
  const resolved = aliases[canonical] ?? canonical;
  return Object.hasOwn(languages, resolved)
    ? languages[resolved as keyof typeof languages]
    : { color: '#E9E9E4', code: '—' };
}
