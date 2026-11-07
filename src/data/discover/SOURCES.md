# Noted Discover vocabulary sources

Dataset version: noted-discover-1. This is a curated initial collection, not a complete English vocabulary or a certified CEFR instrument.

- **CEFR-J Wordlist Version 1.5**, compiled by Yukio Tono, Tono Laboratory, Tokyo University of Foreign Studies. Vocabulary profiles supplied to [Open Language Profiles](https://github.com/openlanguageprofiles/olp-en-cefrj). [Original project](https://www.cefr-j.org/). Research and commercial use without charge with proper citation; copyright remains with Tono Laboratory. Full terms accompany this file in LICENSE-CEFR-J.md.
- **Octanove Vocabulary Profile C1/C2 1.0**, Octanove Labs, via the same repository. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). We use the word/POS bands as recommendation references, not an official sense-level difficulty certification.
- **Princeton WordNet 3.0**, [Princeton University](https://wordnet.princeton.edu/), distributed from https://wordnetcode.princeton.edu/3.0/WNdb-3.0.tar.gz. Word senses, POS, definitions, usage examples and tagged sense counts. WordNet's permissive notice is reproduced in LICENSE-WORDNET.txt. Tagged counts are an attestation/usefulness signal, not a general-English frequency ranking.
- **Chinese Open WordNet**, Francis Bond and Shan Wang, copyright 2013–2014, via https://github.com/omwn/omw-data/tree/main/wns/cow. Permissive WordNet-style license reproduced in LICENSE-COW.txt. The displayed Chinese equivalents are selected from the matching WordNet synset's Chinese lemmas. They are not machine-generated definitions.

Changes: joined by lemma/POS and WordNet synset; restricted to real usage examples and attested senses; selected Chinese equivalents in scripts/discover-curation.json; excluded obvious mismatches/poor examples. A word-level CEFR profile can cover multiple senses, so the selected sense's exact CEFR difficulty is not certified. Dictionary data may contain imperfections. Example capitalization/fragments follow the original; we do not invent sentences.

Assessment distractors are real equivalents of other catalog entries, with the same POS, excluding overlapping Chinese alternatives and related/synonymous WordNet senses. They are not fabricated definitions. This reduces ambiguity but does not make the assessment psychometrically validated.

The combined derived data is shared under CC BY-SA 4.0 where applicable, retaining all source notices and the CEFR-J citation condition. This does not relicense the application code. Preserve this directory's notices when redistributing the data or a subset.

Rebuild with scripts/build-discover-bank.py and the original source files named there. source-hashes.json records input SHA-256 values. Stable IDs include the dataset version, lemma and synset. Freeze a published version: future corrections should use a new version/ID rather than changing historical cards.
