import {createHash, randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {AI_MODEL,aiConfigured,generateAi} from '@/lib/ai-provider';
import {parseAiEntry,searchLanguage,searchText,type Direction} from '@/lib/bilingual-contract';
export const maxDuration=30;
const headers={'Cache-Control':'no-store'};
async function client(request:Request){const token=request.headers.get('authorization')?.replace(/^Bearer /i,'');const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!token||!url||!key)throw Error('Sign in to use AI help.');const c=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await c.auth.getUser(token);if(error||!data.user)throw Error('Sign in to use AI help.');return c;}
function queryKey(q:string,direction:Direction){return createHash('sha256').update('noted-ai-v1:'+searchLanguage(q,direction)+':'+q).digest('hex');}
async function previewModelCatalog(request: Request) {
  const unavailable = () => new Response(null, { status: 404, headers });
  if (process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'noted-round-05-1' ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') !== 'https://ezwsibsijwnulfypvbha.supabase.co') {
    return unavailable();
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer /i, '');
  try {
    const supabase = await client(request);
    const { data } = await supabase.auth.getUser(bearer);
    if (data.user?.id !== 'b48579a1-8c98-4c3e-a8cd-a2b04d80a415') return unavailable();
  } catch {
    return unavailable();
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ category: 'missing_key' }, { status: 503, headers });
  const modelIds = new Set<string>();
  const signal = AbortSignal.timeout(12000);
  let nextPageToken: string | undefined;
  try {
    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize', '100');
      if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
      const response = await fetch(url, { headers: { 'x-goog-api-key': key }, signal, cache: 'no-store' });
      if (!response.ok) {
        return Response.json({ upstreamStatus: response.status }, { status: 502, headers });
      }
      const page = await response.json();
      for (const model of page.models ?? []) {
        if (typeof model.name === 'string' && /^models\/[a-z0-9][a-z0-9.-]+$/i.test(model.name) &&
            Array.isArray(model.supportedGenerationMethods) &&
            model.supportedGenerationMethods.includes('generateContent')) {
          modelIds.add(model.name.slice('models/'.length));
        }
      }
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
    return Response.json({ generateContent: [...modelIds].sort() }, { headers });
  } catch {
    return Response.json({ category: signal.aborted ? 'timeout' : 'catalog_unavailable' }, { status: 502, headers });
  }
}

export async function GET(request:Request){const query=new URL(request.url).searchParams;if(query.get('mode')==='preview-model-catalog')return previewModelCatalog(request);if(query.get('mode')==='enrichment')return enrich(request,Object.fromEntries(query),true);if(!aiConfigured())return Response.json({available:false,message:'AI help is not enabled. Dictionary and translation remain available.'},{headers});try{const c=await client(request),url=new URL(request.url),q=url.searchParams.get('q');const check=await c.from('noted_ai_entries').select('query_hash').limit(0);const words=await c.from('words').select('example_source').limit(0);if(check.error||words.error)return Response.json({available:false,message:'AI help is not available yet.'},{headers});if(!q)return Response.json({available:true},{headers});const direction=url.searchParams.get('direction');if(!['auto','en','zh'].includes(direction||''))throw Error('Choose a language direction.');const hit=await c.from('noted_ai_entries').select('payload').eq('query_hash',queryKey(searchText(q),direction as Direction)).gt('expires_at',new Date().toISOString()).maybeSingle();return Response.json({available:true,entry:hit.data?.payload?parseAiEntry(hit.data.payload):null},{headers});}catch{return Response.json({available:false,message:'Sign in to use AI help.'},{headers});}}
export async function POST(request:Request){if(!aiConfigured())return Response.json({message:'AI help is not enabled. Dictionary and translation remain available.'},{status:503,headers});let c:Awaited<ReturnType<typeof client>>|undefined,hash='',lease='';try{if(Number(request.headers.get('content-length'))>4096)throw Error('Search text is too long.');const body=await request.json();if(body.mode==='translation')return translate(request,body);if(body.mode==='enrichment')return enrich(request,body);if(body.consent!==true||!['auto','en','zh'].includes(body.direction))throw Error('Confirm that this search may be sent to Gemini.');const q=searchText(body.q);c=await client(request);hash=queryKey(q,body.direction);const schema=await c.from('words').select('example_source').limit(0);if(schema.error)return Response.json({message:'AI help is not available yet.'},{status:503,headers});const reserved=await c.rpc('noted_ai_reserve',{p_hash:hash});if(reserved.error)return Response.json({message:'AI help is not available yet. Dictionary and translation still work.'},{status:503,headers});const state=reserved.data;if(state.status==='cached')return Response.json({entry:parseAiEntry(state.payload),cached:true},{headers});if(state.status==='pending')return Response.json({message:'This explanation is already being prepared. Try again shortly.'},{status:202,headers});if(state.status!=='reserved')return Response.json({message:'AI request limit reached. Dictionary and translation still work.'},{status:429,headers});lease=state.lease;const entry=await generateAi(q,body.direction);const saved=await c.rpc('noted_ai_finish',{p_hash:hash,p_lease:lease,p_payload:entry});if(saved.error||saved.data!==true)throw Error('Could not confirm the saved explanation. Please retry later.');return Response.json({entry},{headers});}catch(error){if(c&&hash&&lease)await c.rpc('noted_ai_fail',{p_hash:hash,p_lease:lease});return Response.json({message:error instanceof Error?error.message:'AI help is unavailable.'},{status:503,headers});}}

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
    hash = createHash('sha256').update('noted-translation-v2:' + JSON.stringify(input)).digest('hex');
    const reserved = await c.rpc('noted_ai_reserve', { p_hash: hash });
    if (reserved.error) {
      console.warn('[noted.ai.translation] quota_rpc_unavailable');
      throw Error('AI translation is unavailable.');
    }
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

async function enrich(request:Request,body:Record<string,unknown>,cacheOnly=false){
  const started = performance.now();
  const diagnostic = process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'noted-round-05-1' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') === 'https://ezwsibsijwnulfypvbha.supabase.co';
  const requestId = diagnostic ? randomUUID() : undefined;
  let stage = 'request_setup';
  let category = 'unexpected_error';
  let authenticated = false;
  const {EnrichmentValidationError} = await import('@/lib/dictionary-enrichment');
  const {EnrichmentProviderError} = await import('@/lib/dictionary-enrichment-provider');
  function report(failureStage: string, errorCategory: string, upstreamStatus?: number, paths?: string[]) {
    if (!requestId) return;
    const metadata = { requestId, stage: failureStage, category: errorCategory, model: AI_MODEL,
      durationMs: Math.round(performance.now() - started), upstreamStatus, paths };
    console.warn('[noted.ai.enrichment]', JSON.stringify(metadata));
    // Return the same safe metadata only to signed-in callers explicitly requesting staging diagnostics.
    if (authenticated && request.headers.get('x-noted-diagnostic') === '1') return metadata;
  }
  if(!aiConfigured())return Response.json({available:false,message:'AI learning notes are disabled.'},{headers});
  let c:Awaited<ReturnType<typeof client>>|undefined,hash='',lease='';
  try {
    const [{learningLanguages,targetText},{parseEnrichment},{generateEnrichment}]=await Promise.all([
      import('@/lib/collections'),import('@/lib/dictionary-enrichment'),import('@/lib/dictionary-enrichment-provider'),
    ]);
    const {target,explanation}=body;
    const word=typeof body.q==='string'?body.q.trim():'';
    if((!cacheOnly&&body.consent!==true)||typeof target!=='string'||!Object.hasOwn(learningLanguages,target)
      ||(explanation!=='zh-CN'&&explanation!=='en')||!targetText(word,target as keyof typeof learningLanguages,120))
      return Response.json({message:'Choose valid languages and confirm AI use.'},{status:400,headers});
    const partOfSpeech=typeof body.partOfSpeech==='string'&&/^[\p{L}\p{M} /-]{1,60}$/u.test(body.partOfSpeech)?body.partOfSpeech:'';
    const level=typeof body.level==='string'&&/^(A[12]|B[12]|C[12]|beginner|intermediate|advanced)$/.test(body.level)?body.level:'unspecified';
    const input={word,target,explanation,partOfSpeech,level} satisfies import('@/lib/dictionary-enrichment').EnrichmentInput;
    stage = 'authentication';
    c=await client(request);
    authenticated = true;
    hash=createHash('sha256').update('noted-dictionary-enrichment-v1:'+JSON.stringify(input)).digest('hex');
    if(cacheOnly){
      const hit=await c.from('noted_ai_entries').select('payload').eq('query_hash',hash).gt('expires_at',new Date().toISOString()).maybeSingle();
      if(hit.error)return Response.json({available:false,message:'AI cache is unavailable.'},{headers});
      let result=null;
      if(hit.data?.payload){try{result=parseEnrichment(hit.data.payload,input);}catch{/* Ignore expired-format or malformed cached data. */}}
      return Response.json({available:true,result},{headers});
    }
    stage = 'quota_reservation';
    const reserved=await c.rpc('noted_ai_reserve',{p_hash:hash});
    if (reserved.error) {
      category = 'reservation_rpc_failed';
      throw Error('AI quota unavailable');
    }
    const state=reserved.data;
    if(state.status==='cached')return Response.json({result:parseEnrichment(state.payload,input),cached:true},{headers});
    if(state.status!=='reserved')return Response.json({message:state.status==='pending'?'Learning notes are already being prepared. Try again shortly.':'AI request limit reached.'},{headers,status:state.status==='pending'?202:429});
    lease=state.lease;
    stage = 'gemini_request';
    const result=await generateEnrichment(input);
    stage = 'cache_write';
    const saved=await c.rpc('noted_ai_finish',{p_hash:hash,p_lease:lease,p_payload:result});
    if (saved.error || saved.data !== true) {
      stage = saved.error ? 'cache_write' : 'reservation_completion';
      category = saved.error ? 'finish_rpc_failed' : 'lease_not_completed';
      throw Error('Could not save learning notes');
    }
    return Response.json({result},{headers});
  } catch (error) {
    const details = error instanceof EnrichmentProviderError
      ? report(error.stage, error.category, error.upstreamStatus)
      : error instanceof EnrichmentValidationError
        ? report('structured_validation', 'invalid_learning_notes', 200, error.paths)
        : report(stage, category);
    if (c && hash && lease) {
      try {
        const failed = await c.rpc('noted_ai_fail', {p_hash:hash,p_lease:lease});
        if (failed.error) report('reservation_failure', 'fail_rpc_failed');
      } catch {
        report('reservation_failure', 'fail_rpc_threw');
      }
    }
    return Response.json({message:'AI learning notes are temporarily unavailable. Try again later.', diagnostic: details},{status:503,headers});
  }
}
