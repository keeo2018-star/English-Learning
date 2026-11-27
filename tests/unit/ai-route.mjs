import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import ts from 'typescript';
async function compile(path,mapping={}){let source=ts.transpileModule(await fs.readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;for(const[from,to]of Object.entries(mapping))source=source.replaceAll("'"+from+"'",JSON.stringify(to)).replaceAll(JSON.stringify(from),JSON.stringify(to));return'data:text/javascript;base64,'+Buffer.from(source).toString('base64');}
const contract=new URL('../../src/lib/bilingual-contract.ts',import.meta.url).href;
const provider=await compile('../../src/lib/ai-provider.ts',{'./bilingual-contract':contract});
const stub='data:text/javascript,'+encodeURIComponent('export function createClient(){return globalThis.__notedAiClientTest;}');
const enrichment=new URL('../../src/lib/dictionary-enrichment.ts',import.meta.url).href;
const enrichProvider=await compile('../../src/lib/dictionary-enrichment-provider.ts',{'./ai-provider':provider,'./dictionary-enrichment':enrichment});
const route=await import(await compile('../../src/app/api/ai-dictionary/route.ts',{
 '@supabase/supabase-js':stub,'@/lib/ai-provider':provider,'@/lib/bilingual-contract':contract,
 '@/lib/collections':new URL('../../src/lib/collections.ts',import.meta.url).href,
 '@/lib/dictionary-enrichment':enrichment,'@/lib/dictionary-enrichment-provider':enrichProvider,
}));
test('AI HTTP route gates auth, schema, persistent budget and cache before any model request',async()=>{
 const originals={fetch:globalThis.fetch,key:process.env.GEMINI_API_KEY,flag:process.env.GEMINI_FREE_TIER_ENABLED};
 const entry={explanation:'区分表达语境。',alternatives:[{english:'awkward',meaning:'令人尴尬',usage:'形容局面'}],related:[]};
 const state={auth:true,schema:true,status:'reserved',modelCalls:0,quota:[],fail:false};
 const builder={select(){return this},limit(){return Promise.resolve({error:state.schema?null:{code:'PGRST205'}})},eq(){return this},gt(){return this},maybeSingle(){return Promise.resolve({data:{payload:entry}})}};
 globalThis.__notedAiClientTest={auth:{getUser:async()=>({data:{user:state.auth?{id:'owner'}:null},error:state.auth?null:{message:'invalid'}})},from:()=>builder,rpc:async(name)=>{state.quota.push(name);if(name==='noted_ai_reserve')return{data:{status:state.status,lease:'lease-token',payload:entry}};return{data:true}}};
 globalThis.fetch=async(url,options)=>{assert(String(url).startsWith('https://generativelanguage.googleapis.com/'));state.modelCalls++;const input=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);assert.deepEqual(input,{language:'zh',query:'尴尬'});return state.fail?new Response('',{status:429}):Response.json({candidates:[{content:{parts:[{text:JSON.stringify(entry)}]}}]});};
 const post=()=>route.POST(new Request('https://noted.test/api/ai-dictionary',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fake-token'},body:JSON.stringify({q:'尴尬',direction:'zh',consent:true,my_context:'PRIVATE MUST NOT LEAVE',voice:'PRIVATE'})}));
 try{
  process.env.GEMINI_API_KEY='test-only-key';delete process.env.GEMINI_FREE_TIER_ENABLED;assert.equal((await post()).status,503);assert.equal(state.modelCalls,0);assert.deepEqual(state.quota,[]);
  process.env.GEMINI_FREE_TIER_ENABLED='true';state.auth=false;assert.equal((await post()).status,503);assert.equal(state.modelCalls,0);state.auth=true;
  state.schema=false;assert.equal((await post()).status,503);assert.equal(state.modelCalls,0);state.schema=true;
  state.status='limited';assert.equal((await post()).status,429);assert.equal(state.modelCalls,0);
  state.status='pending';assert.equal((await post()).status,202);assert.equal(state.modelCalls,0);
  state.status='cached';assert.equal((await post()).status,200);assert.equal(state.modelCalls,0);
  state.status='reserved';assert.equal((await post()).status,200);assert.equal(state.modelCalls,1);assert(state.quota.includes('noted_ai_finish'));
  state.fail=true;assert.equal((await post()).status,503);assert.equal(state.modelCalls,2);assert.equal(state.quota.at(-1),'noted_ai_fail');
 }finally{globalThis.fetch=originals.fetch;delete globalThis.__notedAiClientTest;for(const[k,v]of Object.entries({GEMINI_API_KEY:originals.key,GEMINI_FREE_TIER_ENABLED:originals.flag})){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('Dictionary enrichment reuses owner quota, caches validated structured output and isolates locale keys',async()=>{
 const original={fetch:globalThis.fetch,key:process.env.GEMINI_API_KEY,flag:process.env.GEMINI_FREE_TIER_ENABLED};
 let cached=null,limited=false,modelCalls=0,failed=0,invalid=false;
 const hashes=[];
 const cacheQuery={select(){return this;},eq(column,hash){assert.equal(column,'query_hash');assert.equal(hash,hashes[0]);return this;},
   gt(column){assert.equal(column,'expires_at');return this;},maybeSingle(){return Promise.resolve({data:{payload:cached}});}};
 globalThis.__notedAiClientTest={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>cacheQuery,rpc:async(name,args)=>{
  if(name==='noted_ai_reserve'){hashes.push(args.p_hash);return{data:limited?{status:'limited'}:cached?{status:'cached',payload:cached}:{status:'reserved',lease:'lease'}};}
  if(name==='noted_ai_finish'){cached=args.p_payload;return{data:true};}
  if(name==='noted_ai_fail')failed++;
  return{data:true};
 }};
 globalThis.fetch=async (url,options)=>{
  assert.match(String(url),/^https:\/\/generativelanguage.googleapis.com/);
  modelCalls++;
  const payload=JSON.parse(options.body), input=JSON.parse(payload.contents[0].parts[0].text);
  assert.deepEqual(Object.keys(input).sort(),['explanation','level','partOfSpeech','target','word']);
  assert.equal(payload.generationConfig.responseMimeType,'application/json');
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({
    word:input.word,target:input.target,explanationLanguage:input.explanation,
    collocations:invalid?[]:[{expression:'dire bonjour',explanation:'打招呼。'}],contexts:[],usage:invalid?'':'白天见面时用来问好。',
  })}]}}]});
 };
 const post=(extra={})=>route.POST(new Request('https://noted.test/api/ai-dictionary',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test'},
  body:JSON.stringify({mode:'enrichment',q:'bonjour',target:'fr',explanation:'zh-CN',level:'A1',consent:true,privateNote:'private',...extra})}));
 try{
  process.env.GEMINI_API_KEY='test-key';process.env.GEMINI_FREE_TIER_ENABLED='true';
  assert.equal((await post({consent:false})).status,400);
  assert.equal((await post()).status,200);
  const hit=await post();assert.equal(hit.status,200);assert.equal((await hit.json()).cached,true);
  assert.equal(modelCalls,1);assert.equal(hashes[0],hashes[1]);
  const lookup=()=>route.GET(new Request('https://noted.test/api/ai-dictionary?mode=enrichment&q=bonjour&target=fr&explanation=zh-CN&level=A1',{headers:{Authorization:'Bearer test'}}));
  const snapshot=await (await lookup()).json();
  assert.equal(snapshot.available,true);
  assert.equal(snapshot.result.collocations[0].expression,'dire bonjour');
  assert.equal(hashes.length,2);assert.equal(modelCalls,1);
  const goodCache=cached;cached={word:'unrelated'};
  assert.equal((await (await lookup()).json()).result,null);
  cached=goodCache;
  limited=true;assert.equal((await post({explanation:'en'})).status,429);assert.notEqual(hashes[1],hashes[2]);
  limited=false;cached=null;invalid=true;assert.equal((await post()).status,503);assert.equal(failed,1);
 }finally{globalThis.fetch=original.fetch;delete globalThis.__notedAiClientTest;
  for(const [key,value] of Object.entries({GEMINI_API_KEY:original.key,GEMINI_FREE_TIER_ENABLED:original.flag})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
