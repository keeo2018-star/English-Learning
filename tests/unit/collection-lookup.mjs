import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import ts from 'typescript';
async function moduleUrl(path,mapping){let code=ts.transpileModule(await fs.readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;for(const [from,to]of Object.entries(mapping))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to)).replaceAll("'"+from+"'",JSON.stringify(to));return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');}
const contract=new URL('../../src/lib/bilingual-contract.ts',import.meta.url).href;
const bilingual=await moduleUrl('../../src/lib/bilingual.ts',{'./bilingual-contract':contract,'./dictionary':new URL('../../src/lib/dictionary.ts',import.meta.url).href});
const {collectionLookup}=await import(await moduleUrl('../../src/lib/collection-lookup.ts',{'./dictionary':new URL('../../src/lib/dictionary.ts',import.meta.url).href,'./bilingual-contract':contract,'./bilingual':bilingual,'./collections':new URL('../../src/lib/collections.ts',import.meta.url).href}));
const response=text=>Response.json({responseStatus:200,responseData:{translatedText:text}});
test('whole Chinese expression resolves to French; same lookup is cached/deduplicated by language context',async()=>{let calls=0;const fetcher=async url=>{calls++;const q=new URL(url);assert.equal(q.hostname,'api.mymemory.translated.net');assert.equal(q.searchParams.get('q'),'充分利用这个机会');assert.equal(q.searchParams.get('langpair'),'zh-CN|fr');return response('profiter de cette occasion');};const [a,b]=await Promise.all([collectionLookup('充分利用这个机会','fr','zh-CN','auto',fetcher),collectionLookup('充分利用这个机会','fr','zh-CN','auto',fetcher)]);assert.equal(calls,1);assert.equal(a[0].english,'profiter de cette occasion');assert.equal(a[0].meaning,'充分利用这个机会');assert.deepEqual(a,b);await collectionLookup('充分利用这个机会','fr','zh-CN','auto',fetcher);assert.equal(calls,1);});
test('French and Spanish meanings use their actual target locale and never the English dictionary',async()=>{const pairs=[];const fetcher=async url=>{const pair=new URL(url).searchParams.get('langpair');pairs.push(pair);return response(pair==='fr|en'?'cat':'聊天');};const french=await collectionLookup('chat','fr','en','fr',fetcher);const spanish=await collectionLookup('chat','es','zh-CN','es',fetcher);assert.equal(french[0].english,'chat');assert.equal(french[0].meaning,'cat');assert.equal(spanish[0].meaning,'聊天');assert.deepEqual(pairs,['fr|en','es|zh-CN']);});
test('Chinese learning saves characters, preserves English source meaning and encodes punctuation safely',async()=>{const query="I wouldn’t put it that way.";const result=await collectionLookup(query,'zh-CN','en','en',async url=>{assert.equal(new URL(url).searchParams.get('q'),query);assert.equal(new URL(url).searchParams.get('langpair'),'en|zh-CN');return response('我不会那样说。');});assert.equal(result[0].english,'我不会那样说。');assert.equal(result[0].meaning,query);});
test('provider failures, quota, unsupported output scripts and empty/HTML results never become saved suggestions',async()=>{await assert.rejects(collectionLookup('额度检查','es','zh-CN','auto',async()=>Response.json({responseStatus:200,quotaFinished:true,responseData:{translatedText:'hola'}})),/unavailable/);await assert.rejects(collectionLookup('wrong Chinese output','zh-CN','en','en',async()=>response('still English')),/No usable/);await assert.rejects(collectionLookup('非法结果','fr','zh-CN','auto',async()=>response('<script>')),/unavailable/);await assert.rejects(collectionLookup('a failed network phrase','fr','en','fr',async()=>{throw Error('offline')}),/could not connect/);});
test('English explanations use a verified English definition instead of repeating the query or inventing a gloss',async()=>{const result=await collectionLookup('fortuitous','en','en','en',async()=>Response.json({found:true,entry:{word:'fortuitous',english_definitions:[{part_of_speech:'adjective',definition:'Happening by chance.'}],definitions:[{meaning:'偶然的'}]}}));assert.equal(result[0].english,'fortuitous');assert.equal(result[0].meaning,'Happening by chance.');assert.equal(result[0].source,'dictionary');await assert.rejects(collectionLookup('missing verified gloss','en','en','en',async()=>Response.json({found:true,entry:{word:'missing verified gloss',definitions:[{meaning:'没有英语释义'}]}})),/No English definition/);});
test('third-language input generates the target expression and explanation directly from the original input',async()=>{
 const pairs=[];
 const result=await collectionLookup('good morning','fr','zh-CN','auto',async url=>{
  const params=new URL(url).searchParams;
  assert.equal(params.get('q'),'good morning');
  const pair=params.get('langpair');pairs.push(pair);
  return response(pair==='en|fr'?'bonjour':'早上好');
 });
 assert.deepEqual(pairs,['en|fr','en|zh-CN']);
 assert.equal(result[0].english,'bonjour');
 assert.equal(result[0].meaning,'早上好');
});
test('a failed direct explanation can fall back through the selected target language',async()=>{
 const result=await collectionLookup('bonsoir','en','zh-CN','auto',async url=>{
  const pair=new URL(url).searchParams.get('langpair');
  if(pair==='fr|en')return response('Good evening');
  if(pair==='fr|zh-CN')return new Response(null,{status:503});
  assert.equal(pair,'en|zh-CN');
  return response('晚上好');
 });
 assert.equal(result[0].english,'Good evening');
 assert.equal(result[0].meaning,'晚上好');
});
