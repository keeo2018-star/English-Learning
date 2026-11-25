const languageCodes = { fr: 'fr', es: 'es', 'zh-CN': 'zh' } as const;

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const word = (params.get('word') ?? '').normalize('NFC').trim();
    const language = params.get('language') ?? '';
    if (!Object.hasOwn(languageCodes, language) || word.length > 100 ||
        !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} '\u2019-]*$/u.test(word)) {
        return Response.json({ sections: [] });
    }

    const title = encodeURIComponent(word.replaceAll(' ', '_'));
    const code = languageCodes[language as keyof typeof languageCodes];
    try {
        const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${title}`, {
            headers: { 'User-Agent': 'NotedVocabulary/1.0 (https://github.com/keeo2018-star/English-Learning)' },
            next: { revalidate: 3600 },
            signal: AbortSignal.timeout(5000),
        });
        if (response.status === 404) return Response.json({ sections: [] });
        if (!response.ok) throw new Error('Wiktionary request failed');
        const data = await response.json();
        const sections = Array.isArray(data[code]) ? data[code].slice(0, 8).map(
            (section: { partOfSpeech?: string; definitions?: { definition?: string }[] }) => ({
                partOfSpeech: section.partOfSpeech,
                definitions: Array.isArray(section.definitions)
                    ? section.definitions.slice(0, 6).map(sense => sense.definition)
                    : [],
            })
        ) : [];
        return Response.json({ sections, source: `https://en.wiktionary.org/wiki/${title}` });
    } catch {
        return Response.json({ message: 'Dictionary reference is temporarily unavailable.' }, { status: 503 });
    }
}
