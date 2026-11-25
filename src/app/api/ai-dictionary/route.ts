import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {aiConfigured,generateAi} from '@/lib/ai-provider';
import {parseAiEntry,searchLanguage,searchText,type Direction} from '@/lib/bilingual-contract';
export const maxDuration=30;
const headers={'Cache-Control':'no-store'};
async function client(request:Request){const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!token||!url||!key)throw Error('Sign in to use AI help.');const c=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await c.auth.getUser(token);if(error||!data.user)throw Error('Sign in to use AI help.');return c;}
function queryKey(q:string,direction:Direction){return createHash('sha256').update('noted-ai-v1:'+searchLanguage(q,direction)+':'+q).digest('hex');}
export async function GET(request:Request){if(!aiConfigured())return Response.json({available:false,message:'AI help is not enabled. Dictionary and translation remain available.'},{headers});try{const c=await client(request),url=new URL(request.url),q=url.searchParams.get('q');const check=await c.from('noted_ai_entries').select('query_hash').limit(0);const words=await c.from('words').select('example_source').limit(0);if(check.error||words.error)return Response.json({available:false,message:'AI help is not available yet.'},{headers});if(!q)return Response.json({available:true},{headers});const direction=url.searchParams.get('direction');if(!['auto','en','zh'].includes(direction||''))throw Error('Choose a language direction.');const hit=await c.from('noted_ai_entries').select('payload').eq('query_hash',queryKey(searchText(q),direction as Direction)).gt('expires_at',new Date().toISOString()).maybeSingle();return Response.json({available:true,entry:hit.data?.payload?parseAiEntry(hit.data.payload):null},{headers});}catch{return Response.json({available:false,message:'Sign in to use AI help.'},{headers});}}
export async function POST(request:Request){if(!aiConfigured())return Response.json({message:'AI help is not enabled. Dictionary and translation remain available.'},{status:503,headers});let c:Awaited<ReturnType<typeof client>>|undefined,hash='',lease='';try{if(Number(request.headers.get('content-length'))>4096)throw Error('Search text is too long.');const body=await request.json();if(body.mode==='translation')return translate(request,body);if(body.consent!==true||!['auto','en','zh'].includes(body.direction))throw Error('Confirm that this search may be sent to Gemini.');const q=searchText(body.q);c=await client(request);hash=queryKey(q,body.direction);const schema=await c.from('words').select('example_source').limit(0);if(schema.error)return Response.json({message:'AI help is not available yet.'},{status:503,headers});const reserved=await c.rpc('noted_ai_reserve',{p_hash:hash});if(reserved.error)return Response.json({message:'AI help is not available yet. Dictionary and translation still work.'},{status:503,headers});const state=reserved.data;if(state.status==='cached')return Response.json({entry:parseAiEntry(state.payload),cached:true},{headers});if(state.status==='pending')return Response.json({message:'This explanation is already being prepared. Try again shortly.'},{status:202,headers});if(state.status!=='reserved')return Response.json({message:'AI request limit reached. Dictionary and translation still work.'},{status:429,headers});lease=state.lease;const entry=await generateAi(q,body.direction);const saved=await c.rpc('noted_ai_finish',{p_hash:hash,p_lease:lease,p_payload:entry});if(saved.error||saved.data!==true)throw Error('Could not confirm the saved explanation. Please retry later.');return Response.json({entry},{headers});}catch(error){if(c&&hash&&lease)await c.rpc('noted_ai_fail',{p_hash:hash,p_lease:lease});return Response.json({message:error instanceof Error?error.message:'AI help is unavailable.'},{status:503,headers});}}

async function translate(request: Request, body: Record<string, unknown>) {
  let c: Awaited<ReturnType<typeof client>> | undefined, hash = '', lease = '';
  try {
    const [{ learningLanguages, inputLanguage }, { parseTranslation }, { generateTranslation }] = await Promise.all([
      import('@/lib/collections'), import('@/lib/translation-candidates'), import('@/lib/translation-provider'),
    ]);
    const { target, explanation, source } = body;
    if (body.consent !== true || typeof target !== 'string' || !Object.hasOwn(learningLanguages, target) ||
      (explanation !== 'en' && explanation !== 'zh-CN') || typeof source !== 'string' ||
      (source !== 'auto' && !Object.hasOwn(learningLanguages, source))) {
      return Response.json({ message: 'Choose valid languages and confirm AI use.' }, { status: 400, headers });
    }
    type Language = keyof typeof learningLanguages;
    const query = searchText(body.q);
    const context = typeof body.context === 'string' ? body.context.trim() : '';
    if (context.length > 500 || /[<>\x00-\x08]/.test(context)) {
      return Response.json({ message: 'Use up to 500 characters of plain text for translation context.' }, { status: 400, headers });
    }
    const input: import('@/lib/translation-candidates').TranslationInput = { query, context, target: target as Language, explanation,
      source: inputLanguage(query, target as Language, source as Language | 'auto'),
      level: typeof body.level === 'string' && /^(A[12]|B[12]|C[12]|beginner|intermediate|advanced)$/.test(body.level) ? body.level : 'unspecified' };
    c = await client(request);
    hash = createHash('sha256').update('noted-translation-v1:' + JSON.stringify(input)).digest('hex');
    const reserved = await c.rpc('noted_ai_reserve', { p_hash: hash });
    if (reserved.error) throw Error('AI translation is unavailable.');
    const state = reserved.data;
    if (state.status === 'cached') return Response.json({ result: parseTranslation(state.payload, input) }, { headers });
    if (state.status !== 'reserved') return Response.json({ message: state.status === 'pending'
      ? 'This translation is already being prepared. Try again shortly.' : 'AI request limit reached.' }, { status: state.status === 'pending' ? 202 : 429, headers });
    lease = state.lease;
    const result = await generateTranslation(input);
    const saved = await c.rpc('noted_ai_finish', { p_hash: hash, p_lease: lease, p_payload: result });
    if (saved.error || saved.data !== true) throw Error('Could not save the generated translation.');
    return Response.json({ result }, { headers });
  } catch {
    if (c && hash && lease) await c.rpc('noted_ai_fail', { p_hash: hash, p_lease: lease });
    return Response.json({ message: 'AI translation is temporarily unavailable. Your draft is kept.' }, { status: 503, headers });
  }
}
