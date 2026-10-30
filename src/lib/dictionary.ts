export type DictionaryResult = {
    word: string;
    phonetics: {
        accent: string;
        text: string;
        audio?: string;
    }[];
    chinese: string[];
    english: {
        partOfSpeech: string;
        definition: string;
    }[];
    examples: {
        source: string;
        translation: string;
    }[];
    synonyms: string[];
};
const record = (v: unknown): Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v.slice(0, 20) : [];
const text = (v: unknown, max = 2000) => typeof v === "string" ? v.trim().slice(0, max) : "";
export class DictionaryError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = "DictionaryError"; }
}
export function validateDictionaryWord(value: string | null) {
    const word = (value || "").trim().replace(/\s+/g, " ");
    if (!word)
        throw new DictionaryError(400, "empty", "Enter a word to look up.");
    if (word.length > 120 || !/^[a-zA-Z][a-zA-Z'’ -]*$/.test(word))
        throw new DictionaryError(400, "invalid", "Dictionary lookup supports English words and phrases.");
    return word.toLowerCase();
}
function audioUrl(value: unknown) {
    try {
        const raw = text(value, 1500);
        if (!raw)
            return;
        const url = new URL(raw, "https://uapis.cn");
        if (url.protocol !== "https:" || url.hostname !== "uapis.cn" || url.username || url.password || url.pathname !== "/api/v1/dictionary/audio")
            return;
        return url.href;
    }
    catch {
        return;
    }
}
export function normalizeDictionaryResponse(raw: unknown): DictionaryResult {
    const payload = record(raw);
    if (payload.found === false || payload.code === "WORD_NOT_FOUND")
        throw new DictionaryError(404, "not_found", "No dictionary entry found. Your saved meaning is unchanged.");
    const entry = record(payload.entry), word = text(entry.word, 120);
    if (payload.found !== true || !word)
        throw new DictionaryError(502, "unavailable", "The dictionary returned an unreadable response. Try again later.");
    const phonetics = record(entry.phonetics);
    return {
        word,
        phonetics: ["uk", "us"].flatMap(accent => {
            const item = record(phonetics[accent]), transcription = text(item.text, 160), audio = audioUrl(item.audio);
            return transcription || audio ? [{ accent: accent.toUpperCase(), text: transcription, audio }] : [];
        }),
        chinese: list(entry.definitions).map(v => text(record(v).meaning)).filter(Boolean).slice(0, 6),
        english: list(entry.english_definitions).map(v => { const item = record(v); return { partOfSpeech: text(item.part_of_speech, 80), definition: text(item.definition) }; }).filter(v => v.definition).slice(0, 6),
        examples: list(entry.examples).map(v => { const item = record(v); return { source: text(item.source), translation: text(item.translation) }; }).filter(v => v.source || v.translation).slice(0, 3),
        synonyms: [...new Set(list(entry.synonyms).flatMap(v => list(record(v).words).map(w => text(w, 100))).filter(Boolean))].slice(0, 8),
    };
}
export async function lookupDictionary(word: string, fetcher: typeof fetch = fetch): Promise<DictionaryResult> {
    const query = validateDictionaryWord(word);
    try {
        const response = await fetcher("https://uapis.cn/api/v1/dictionary/lookup?" + new URLSearchParams({ word: query }), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
        if (response.status === 404)
            throw new DictionaryError(404, "not_found", "No dictionary entry found. Your saved meaning is unchanged.");
        if (!response.ok)
            throw new DictionaryError(502, "unavailable", "The dictionary is unavailable right now. Try again later.");
        return normalizeDictionaryResponse(await response.json());
    }
    catch (error) {
        if (error instanceof DictionaryError)
            throw error;
        throw new DictionaryError(502, "unavailable", "The dictionary couldn’t be reached. Try again later.");
    }
}
