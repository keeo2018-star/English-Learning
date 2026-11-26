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

test('comparisons require the selected sense and retain validated usage details',()=>{
 const input={word:'awkward',meaning:'尴尬，不自在',target:'en',explanation:'zh-CN',level:'B1',partOfSpeech:'adjective'};
 const parsed=parseEnrichment({word:'awkward',target:'en',explanationLanguage:'zh-CN',comparisons:[
  {expression:'embarrassed',explanation:'尴尬时更强调因自己的行为而窘迫。',coreMeaning:'尴尬，窘迫',register:'日常口语',situation:'因说错话而尴尬时',example:'I felt embarrassed after my mistake.'},
  {expression:'financial',explanation:'银行贷款有关的术语。',coreMeaning:'金融的'},
 ],usage:'用于令人不自在的场面。'},input);
 assert.equal(parsed.comparisons.length,1);assert.equal(parsed.comparisons[0].expression,'embarrassed');assert.equal(parsed.comparisons[0].example,'I felt embarrassed after my mistake.');assert.equal(parsed.comparisons[0].register,'日常口语');
 const noSense=parseEnrichment({word:'awkward',target:'en',explanationLanguage:'zh-CN',comparisons:[{expression:'clumsy',explanation:'手脚笨拙。'}],usage:'仅为一般用法。'},input);
 assert.equal(noSense.comparisons.length,0);
});
