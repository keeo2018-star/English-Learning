import Link from 'next/link';
import { AppShell } from '@/components/ui/app-shell';
import bank from '@/data/discover/bank.json';
import notices from '@/data/discover/notices.json';
export default function Sources() {
 return <AppShell active="Discover"><article style={{ maxWidth: 760, margin: '0 auto', lineHeight: 1.8 }}>
  <h1>Discover: sources & approach</h1>
  <p>Discover starts with a curated collection of {bank.length} word senses. It uses word-level difficulty references, reliable lexical records and real usage examples. It does not generate definitions or examples with AI.</p>
  <h2>Vocabulary sources</h2>
  <p><a href="https://github.com/openlanguageprofiles/olp-en-cefrj">CEFR-J Wordlist 1.5</a>, compiled by Yukio Tono, Tono Laboratory, Tokyo University of Foreign Studies, supplies A1–B2 word/POS profiles. Research and commercial use is allowed without charge with proper citation. Copyright remains with Tono Laboratory.</p>
  <p>Octanove Labs’ Vocabulary Profile C1/C2 1.0 supplies the advanced word profiles under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. A word profile does not certify the exact difficulty of every meaning of that word.</p>
  <p><a href="https://wordnet.princeton.edu/">Princeton WordNet 3.0</a> supplies word senses, definitions, parts of speech, usage examples and tagged sense counts. Tagged counts are a usefulness signal, not a general-English frequency ranking.</p>
  <p><a href="https://github.com/omwn/omw-data/tree/main/wns/cow">Chinese Open WordNet</a>, copyright 2013–2014 Francis Bond and Shan Wang, supplies Chinese equivalents linked to those senses. We selected concise existing equivalents and excluded obvious mismatches. Lexical resources can still contain imperfections.</p>
  <p>The derived collection retains all source conditions, including applicable CC BY-SA 4.0 terms. Full permission notices and reproducible source hashes are included in <a href="https://github.com/keeo2018-star/English-Learning/tree/main/src/data/discover">the data directory</a>. Redistribution should preserve these notices. Examples retain the original wording, including natural phrase fragments.</p>
  <details><summary>Full permission notices</summary>{Object.entries(notices).map(([name,text]) => <section key={name}><h3>{name}</h3><pre style={{ whiteSpace:'pre-wrap', overflowWrap:'anywhere',fontSize:12 }}>{text}</pre></section>)}</details>
  <h2>The vocabulary check</h2>
  <p>The 16-question check starts near B1. Two consecutive correct answers move the selection up one band; two incorrect or unknown answers move it down one. Periodic adjacent-band questions add coverage. Questions do not repeat within a check, and recent tests are avoided where possible.</p>
  <p>Answer choices use real equivalents from other words with the same part of speech. Overlapping meanings and related WordNet senses are excluded. The estimated starting range uses the final eight questions, with a small adjustment for correct or incorrect responses. This is a practical recommendation heuristic, not a validated CEFR test or a measurement of your overall English ability or vocabulary size.</p>
  <h2>Your daily words</h2>
  <p>Daily picks aim for eight words near your current recommendation level and two slightly above it. Library items and recently recognised words are excluded; recent recommendations are avoided where the collection allows. If a band has too few eligible words, nearby bands fill the set. Fewer than ten may be shown when the remaining collection is small.</p>
  <p>The set is fixed for your account and local calendar date. Recognition patterns across at least twenty responses and actual review outcomes across at least ten reviews and five saved items may change the internal recommendation level by at most a quarter-band when a new day is generated. Only fresh evidence is used for later adjustments. Saving alone is not treated as failed recall. Knowing a word once does not mark it permanently mastered.</p>
  <p>Questions include an attested usage context to identify the intended sense of words with several meanings. Retakes preserve history and adjust future recommendations gradually; today’s set stays fixed. Discover choices are not counted as completed Review events; saving a new item contributes to Added activity through the existing learning calendar.</p>
  <Link className="wb-control wb-control-outline" href="/discover">Back to Discover</Link>
 </article></AppShell>;
}
