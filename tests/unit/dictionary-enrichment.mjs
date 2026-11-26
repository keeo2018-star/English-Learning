import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEnrichment} from '../../src/lib/dictionary-enrichment.ts';
const input={word:'bonjour',target:'fr',explanation:'zh-CN',level:'A1',partOfSpeech:'interjection'};
const result={word:'bonjour',target:'fr',explanationLanguage:'zh-CN',comparisons:[
 {expression:'salut',explanation:'更随意的问候。'},{expression:'Salut',explanation:'同一个词。'},
 {expression:'bonjour',explanation:'当前词条。'},{expression:'<script>',explanation:'无效。'},
 {expression:'bonsoir',explanation:'Use in the evening.'}],
 collocations:[{expression:'dire bonjour',explanation:'打招呼。'}],contexts:['初次见面。','初次见面。'],usage:'白天见面时使用。'};
test('validates enrichment identity, scripts, contextual guidance and duplicate comparisons',()=>{
 const parsed=parseEnrichment(result,input);
 assert.deepEqual(parsed.comparisons,[{expression:'salut',explanation:'更随意的问候。'}]);
 assert.deepEqual(parsed.contexts,['初次见面。']);
 assert.equal(parsed.collocations[0].expression,'dire bonjour');
 assert.throws(()=>parseEnrichment({...result,target:'en'},input),/different/);
 assert.throws(()=>parseEnrichment({...result,explanationLanguage:'en'},input),/different/);
 assert.throws(()=>parseEnrichment({...result,comparisons:[],collocations:[],contexts:[],usage:''},input),/no usable/);
});
