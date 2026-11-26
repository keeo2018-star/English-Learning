'use client';

import { useEffect, useState } from 'react';
import { Feedback } from '@/components/ui/states';
import {DefinitionList} from '@/components/learning/reference-reading';
import type { TargetLanguage } from '@/lib/collections';

type Reference = {
    sections: { partOfSpeech: string; definitions: string[] }[];
    source?: string;
};

function plainText(markup: string) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    return template.content.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function CollectionReference({ word, language }: { word: string; language: TargetLanguage }) {
    const [reference, setReference] = useState<Reference | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({ word, language });
        fetch(`/api/collection-reference?${params}`, { signal: AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]) })
            .then(async response => {
                if (!response.ok) throw new Error('Reference request failed');
                const data: Reference = await response.json();
                if (controller.signal.aborted) return;
                const sections = data.sections.map(section => ({
                    partOfSpeech: section.partOfSpeech,
                    definitions: section.definitions.filter(value => typeof value === 'string').map(plainText).filter(Boolean),
                })).filter(section => section.definitions.length > 0);
                setReference({ ...data, sections });
            })
            .catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, [attempt, language, word]);

    if (failed) return <div>
        <Feedback>Dictionary reference is temporarily unavailable.</Feedback>
        <button type="button" className="wb-control" onClick={() => {
            setFailed(false);
            setAttempt(value => value + 1);
        }}>Try again</button>
    </div>;
    if (!reference) return <p className="wb-inline-status" role="status">Loading reference…</p>;
    if (!reference.sections.length) return <p>No dictionary entry found for this word in this language.</p>;

    return <section className="wb-reference-reading" lang="en">
        <h3>Dictionary definitions in English</h3>
        <DefinitionList items={reference.sections.flatMap(section=>section.definitions.map(definition=>({definition,partOfSpeech:section.partOfSpeech})))}/>
        <p><a href={reference.source} target="_blank" rel="noreferrer">Wiktionary contributors</a>
            {' · '}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>
        </p>
    </section>;
}
