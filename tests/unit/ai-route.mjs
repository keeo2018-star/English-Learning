import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import ts from 'typescript';
async function compile(path,mapping={}){let source=ts.transpileModule(await fs.readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;for(const[from,to]of Object.entries(mapping))source=source.replaceAll("'"+from+"'",JSON.stringify(to)).replaceAll(JSON.stringify(from),JSON.stringify(to));return'data:text/javascript;base64,'+Buffer.from(source).toString('base64');}
const contract=new URL('../../src/lib/bilingual-contract.ts',import.meta.url).href;
const provider=await compile('../../src/lib/ai-provider.ts',{'./bilingual-contract':contract});
const stub='data:text/javascript,'+encodeURIComponent('export function createClient(){return globalThis.__notedAiClientTest;}');
const route=await import(await compile('../../src/app/api/ai-dictionary/route.ts',{'@supabase/supabase-js':stub,'@/lib/ai-provider':provider,'@/lib/bilingual-contract':contract}));
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
