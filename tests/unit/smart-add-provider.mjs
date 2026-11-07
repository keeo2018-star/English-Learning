import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
// The app uses bundler resolution; resolve its one runtime import for Node's native runner.
const source = await fs.readFile(new URL('../../src/lib/smart-add.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace("'./dictionary'", JSON.stringify(new URL('../../src/lib/dictionary.ts', import.meta.url).href));
const { suggestEnglish, suggestMeaning } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
test('autocomplete uses the official endpoint, prefix first, max five, no translation fan-out', async () => {
  let calls=0;
  const result=await suggestEnglish('subt',async url=>{calls++;assert.equal(new URL(url).hostname,'api.datamuse.com');return Response.json([{word:'something'},{word:'subtle'},{word:'subtly'},{word:'subtlety'},{word:'subtend'},{word:'subtends'},{word:'<bad>'},{word:'subtle'}]);});
  assert.equal(calls,1); assert.equal(result.length,5); assert.equal(result[0].word,'subtle'); assert.ok(result.every(x=>x.word.startsWith('subt')));
});
test('unsupported autocomplete and empty input do not call a provider', async()=>{
  for(const query of ['s','', '中', 'x'.repeat(65)]) assert.deepEqual(await suggestEnglish(query,()=>{throw Error('must not call')}),[]);
});
test('word meaning uses bilingual dictionary without translation calls',async()=>{
  let calls=0;const result=await suggestMeaning('subtle','word',async url=>{calls++;assert.equal(new URL(url).hostname,'uapis.cn');return Response.json({found:true,entry:{word:'subtle',definitions:[{meaning:'微妙的；细微的；含蓄的'}]}});});
  assert.deepEqual(result,{meaning:'微妙的；细微的',source:'dictionary'});assert.equal(calls,1);
});
test('complete sentence translates as a single segment with truthful source',async()=>{
  const query="I wouldn't put it that way.";
  const result=await suggestMeaning(query,'expression',async url=>{const parsed=new URL(url);assert.equal(parsed.hostname,'api.mymemory.translated.net');assert.equal(parsed.searchParams.get('q'),query);return Response.json({responseStatus:200,quotaFinished:false,responseData:{translatedText:'我不会这么说。'}});});
  assert.deepEqual(result,{meaning:'我不会这么说。',source:'translation'});
});
test('missing phrase dictionary entry falls back to whole-phrase translation',async()=>{
  const calls=[];const result=await suggestMeaning('caught off guard','auto',async url=>{calls.push(url);return new URL(url).hostname==='uapis.cn'?Response.json({found:false}):Response.json({responseStatus:200,responseData:{translatedText:'措手不及'}});});
  assert.equal(calls.length,2);assert.equal(new URL(calls[1]).searchParams.get('q'),'caught off guard');assert.equal(result.meaning,'措手不及');
});
test('quota and untranslated/error responses cannot become Chinese meanings',async()=>{
  await assert.rejects(suggestMeaning('A completely different sentence.','expression',async()=>Response.json({responseStatus:429,quotaFinished:true,responseData:{translatedText:'额度用尽'}})));
  assert.deepEqual(await suggestMeaning('Still another sentence.','expression',async()=>Response.json({responseStatus:200,responseData:{translatedText:'Still another sentence.'}})),{meaning:'',source:null});
});
