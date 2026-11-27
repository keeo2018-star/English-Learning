import {test,expect,type Page} from '@playwright/test';
import {mockCloud,cloudOrigin,cloudUrl,sampleWord,user} from './helpers/cloud';
const ID=(n:number)=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`;
const en={id:ID(1),user_id:user.id,target_language:'en',explanation_language:'zh-CN',proficiency_level:'unspecified',display_order:0,preferences:{},created_at:'2026-01-01T00:00:00Z'};
const fr={...en,id:ID(2),target_language:'fr',proficiency_level:'A1',display_order:1};
const es={...en,id:ID(3),target_language:'es',proficiency_level:'A1',display_order:2};
const zh={...en,id:ID(4),target_language:'zh-CN',explanation_language:'en',proficiency_level:'beginner',display_order:3};
async function setup(page:Page,{many=false,one=false}={}){
 const collections=one?[{...en}]:[{...en},{...fr},{...es},{...zh}];
 const rows:Record<string,unknown>[]=[{...sampleWord,id:ID(10),word:'chat',meaning:'闲聊',collection_id:en.id},{...sampleWord,id:ID(11),word:'chat',meaning:'猫',collection_id:fr.id},{...sampleWord,id:ID(12),word:'你好',meaning:'hello',collection_id:zh.id}];
 if(many)for(let n=0;n<32;n++)rows.push({...sampleWord,id:ID(100+n),word:`English item ${n}`,meaning:`意思 ${n}`,collection_id:en.id});
 const inserts:Record<string,unknown>[]=[],ratings=new Map<string,Record<string,unknown>>(),lookups:Record<string,unknown>[]=[],calendars:Record<string,unknown>[]=[];let dictionaryCalls=0,discoverCalls=0;
 await mockCloud(page,async route=>{const req=route.request(),url=new URL(req.url()),id=url.searchParams.get('id')?.replace(/^eq\./,'');
  if(req.method()==='POST'){const body=req.postDataJSON();inserts.push(body);const row={...sampleWord,...body,id:body.id||crypto.randomUUID()};rows.push(row);return route.fulfill({json:row});}
  if(req.method()==='PATCH'){const row=rows.find(r=>r.id===id);if(row)Object.assign(row,req.postDataJSON());return route.fulfill({json:row});}
  if(req.method()==='DELETE'){const index=rows.findIndex(r=>r.id===id);if(index>=0)rows.splice(index,1);return route.fulfill({json:{id}});}
  return route.fulfill({json:id?rows.find(r=>r.id===id):rows});
 });
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',r=>r.fulfill({json:{version:1,multilingual_enabled:true,learning_ready:true,collections}}));
 await page.route(cloudOrigin+'/rest/v1/learning_collections*',r=>{const req=r.request(),body=req.postDataJSON(),id=new URL(req.url()).searchParams.get('id')?.replace(/^eq\./,'');if(req.method()==='POST'){if(collections.some(c=>c.target_language===body.target_language&&c.explanation_language===body.explanation_language))return r.fulfill({status:409,json:{code:'23505'}});const row={...en,...body,id:crypto.randomUUID()};collections.push(row);return r.fulfill({json:row});}const row=collections.find(c=>c.id===id);Object.assign(row!,body);return r.fulfill({json:{id}});});
 for(const rpc of ['record_learning_review','record_offline_learning_review'])await page.route(cloudOrigin+'/rest/v1/rpc/'+rpc,r=>{const body=r.request().postDataJSON(),row=rows.find(item=>item.id===body.p_item_id)!;if(!ratings.has(body.p_event_id)){ratings.set(body.p_event_id,body);Object.assign(row,{review_state:body.p_review_state,due_at:body.p_due_at,interval_days:body.p_interval_days});}return r.fulfill({json:row});});
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_reorder_collections',r=>{const ids=r.request().postDataJSON().p_ids;collections.forEach(c=>c.display_order=ids.indexOf(c.id));collections.sort((a,b)=>a.display_order-b.display_order);return r.fulfill({json:null});});
 await page.route(cloudOrigin+'/rest/v1/rpc/learning_collection_calendar',r=>{calendars.push(r.request().postDataJSON());return r.fulfill({json:{tracking_since:'2026-01-01T00:00:00Z',days:[]}});});
 await page.route(cloudOrigin+'/rest/v1/rpc/discover_action',r=>{discoverCalls++;return r.fulfill({status:503,json:{message:'Fixture Discover is unavailable'}});});
 await page.route('**/api/ai-dictionary*',r=>r.fulfill({json:{available:false}}));
 await page.route('**/api/dictionary?*',r=>{dictionaryCalls++;return r.fulfill({json:{word:'chat',phonetics:[],chinese:['闲聊'],english:[],examples:[],synonyms:[]}});});
 await page.route('**/api/collection-lookup',r=>{const body=r.request().postDataJSON();lookups.push(body);return r.fulfill({json:{items:[{english:body.query==='充分利用这个机会'?'profiter de cette occasion':body.query,meaning:body.explanation==='en'?'a greeting':'建议释义',usage:'',example:'',exampleTranslation:'',source:'translation'}]}});});
 return{collections,rows,inserts,ratings,lookups,calendars,dictionaryCalls:()=>dictionaryCalls,discoverCalls:()=>discoverCalls};
}
const languageTrigger=(page:Page)=>page.getByRole('button',{name:'Switch learning Collection',exact:true});
const input=(page:Page)=>page.getByRole('combobox',{name:'Word or phrase',exact:true});
async function choose(page:Page,name:string){await languageTrigger(page).click();await page.getByRole('menuitemradio',{name,exact:true}).click();await expect(languageTrigger(page)).toHaveAttribute('data-collection-name',name);await expect(page.getByText('Restoring your draft…')).toHaveCount(0);}

test('independent drafts and meanings survive switching, reload and a save only clears its Collection',async({page})=>{
 test.skip(!cloudUrl);const f=await setup(page);await page.goto('/add');await input(page).fill('English draft');await page.getByLabel('Meaning',{exact:true}).fill('我的英文释义');
 await choose(page,'French');await expect(input(page)).toHaveValue('');await input(page).fill('bonjour');await page.getByLabel('Meaning',{exact:true}).fill('我的法语释义');
 await choose(page,'English');await expect(input(page)).toHaveValue('English draft');await expect(page.getByLabel('Meaning',{exact:true})).toHaveValue('我的英文释义');
 await choose(page,'French');await page.waitForTimeout(400);await page.reload();await expect(input(page)).toHaveValue('bonjour');await expect(page.getByLabel('Meaning',{exact:true})).toHaveValue('我的法语释义');await page.getByRole('button',{name:'Add to my library +',exact:true}).click();await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();expect(f.inserts[0].collection_id).toBe(fr.id);expect(f.inserts[0].meaning).toBe('我的法语释义');await expect(input(page)).toHaveValue('');await choose(page,'English');await expect(input(page)).toHaveValue('English draft');
});

test('Library scopes duplicates and All browsing never changes Add or Review language',async({page})=>{
 test.skip(!cloudUrl);await setup(page);await page.goto('/library');await choose(page,'French');await expect(page.getByText('猫',{exact:true})).toBeVisible();await expect(page.getByText('闲聊',{exact:true})).toHaveCount(0);await page.getByLabel('Library browsing scope',{exact:true}).selectOption('all');await expect(page.getByText('闲聊',{exact:true})).toBeVisible();await expect(page.getByText('猫',{exact:true})).toBeVisible();await page.goto('/add');await expect(languageTrigger(page)).toHaveAttribute('data-collection-name','French');await input(page).fill('chat');await expect(page.getByText('Already in your Library',{exact:true})).toBeVisible();await choose(page,'Spanish');await input(page).fill('chat');await expect(page.getByText('Already in your Library',{exact:true})).toHaveCount(0);
});

test('Chinese resolves to French, manual meanings survive stale lookup, and French references never hit English providers',async({page})=>{
 test.skip(!cloudUrl);const f=await setup(page);await page.goto('/add');await choose(page,'French');await input(page).fill('充分利用这个机会');await page.getByRole('button',{name:'Translate',exact:true}).click();await expect(page.getByRole('heading',{name:'profiter de cette occasion',exact:true})).toBeVisible();await page.getByLabel('Meaning',{exact:true}).fill('把握这个机会');await page.getByRole('button',{name:'Add to my library +',exact:true}).click();await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();expect(f.inserts[0].word).toBe('profiter de cette occasion');expect(f.inserts[0].meaning).toBe('把握这个机会');await page.goto('/library');const before=f.dictionaryCalls();await page.route('**/api/collection-reference?*',async route=>{
  const params=new URL(route.request().url()).searchParams;
  expect(params.get('word')).toBe('profiter de cette occasion');
  expect(params.get('language')).toBe('fr');
  await route.fulfill({json:{sections:[{partOfSpeech:'Verb',definitions:['Take <b>advantage</b> of this opportunity.']}],source:'https://en.wiktionary.org/wiki/profiter'}});
 });await page.getByRole('button',{name:'Dictionary for profiter de cette occasion',exact:true}).click();
 const reference=page.getByRole('dialog');
 await expect(reference).toContainText('把握这个机会');
 await expect(reference).toContainText('Take advantage of this opportunity.');
 await expect(reference.getByRole('link',{name:'Wiktionary contributors'})).toBeVisible();expect(f.dictionaryCalls()).toBe(before);expect(f.lookups.some(request=>request.target==='fr')).toBe(true);
});

test('English 17/30 resumes after a French session; offline ratings retain both Collections',async({page,context})=>{
 test.skip(!cloudUrl);const f=await setup(page,{many:true});await page.goto('/review?mode=random');await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('max','30');for(let i=0;i<17;i++){await page.getByRole('button',{name:'Reveal answer',exact:true}).click();await page.getByRole('button',{name:'Sure',exact:true}).click();}await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','17');const ids=[...f.ratings.keys()];
 await choose(page,'French');await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','0');await page.getByRole('button',{name:'Reveal answer',exact:true}).click();await page.getByRole('button',{name:'Not sure',exact:true}).click();await expect(page.getByText('Review complete.',{exact:true})).toBeVisible();
 await choose(page,'English');await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','17');expect(ids.every(id=>f.ratings.has(id))).toBe(true);await context.setOffline(true);await page.getByRole('button',{name:'Reveal answer',exact:true}).click();await page.getByRole('button',{name:'Sure',exact:true}).click();await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','18');
 await choose(page,'French');await page.getByRole('button',{name:'Start another review',exact:true}).click();await page.getByRole('button',{name:'Reveal answer',exact:true}).click();await page.getByRole('button',{name:'Sure',exact:true}).click();await choose(page,'English');await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','18');await context.setOffline(false);await expect.poll(()=>f.ratings.size).toBe(20);
});

test('Profile settings persist independently and ordering stays separate from preferences',async({page})=>{
 test.skip(!cloudUrl);
 const f=await setup(page,{one:true});
 await page.goto('/auth');
 await page.getByRole('button',{name:'Add a language',exact:true}).click();
 await page.getByLabel('Language to learn',{exact:true}).selectOption('fr');
 await page.getByLabel('Approximate level',{exact:true}).selectOption('A1');
 await page.getByRole('button',{name:'Add French',exact:true}).click();
 const french=page.getByRole('button',{name:'Settings for French'});
 await expect(french).toContainText('A1');
 await french.click();
 const sheet=page.getByRole('dialog',{name:'Language settings'});
 await expect(sheet).toBeVisible();
 await sheet.getByRole('button',{name:'Level for French'}).click();
 await sheet.getByRole('menuitemradio',{name:'B1',exact:true}).click();
 await expect(sheet.getByRole('button',{name:'Level for French'})).toContainText('B1');
 await sheet.getByRole('switch',{name:'Auto pronunciation'}).click();
 await expect(sheet.getByRole('switch',{name:'Auto pronunciation'})).not.toBeChecked();
 await sheet.getByRole('button',{name:'Explanation language for French'}).click();
 await sheet.getByRole('menuitemradio',{name:'English',exact:true}).click();
 await expect(sheet.getByRole('button',{name:'Explanation language for French'})).toContainText('English');
 await sheet.getByRole('button',{name:'Done',exact:true}).click();
 await expect(french).toContainText('English explanations');
 await expect(french).toBeFocused();
 await page.getByRole('button',{name:'Edit order',exact:true}).click();
 await page.getByRole('button',{name:'Move French up',exact:true}).click();
 await expect(page.locator('.wb-language-row').first()).toContainText('French');
 await expect(page.locator('.wb-language-row').first().locator('.wb-language-mark')).toHaveCSS('background-color','rgb(181, 212, 244)');
 await page.getByRole('button',{name:'Done ordering',exact:true}).click();
 expect(f.collections.find(c=>c.target_language==='en')!.proficiency_level).toBe('unspecified');
 await page.getByRole('button',{name:'Calendar language'}).click();
 await page.getByRole('menuitemradio',{name:'English',exact:true}).click();
 await expect.poll(()=>f.calendars.at(-1)?.p_collection).toBe(en.id);
 await page.reload();
 await french.click();
 await expect(sheet.getByRole('switch',{name:'Auto pronunciation'})).not.toBeChecked();
 await expect(sheet.getByText('Currently active')).toBeVisible();
 await sheet.getByRole('button',{name:'Done',exact:true}).click();
 await page.goto('/add');
 await expect(languageTrigger(page)).toHaveAttribute('data-collection-name','French');
});

test('Discover gates unsupported languages before requesting English progress',async({page})=>{test.skip(!cloudUrl);const f=await setup(page);await page.goto('/add');await choose(page,'French');await page.goto('/discover');await expect(page.getByText('Discover for French isn’t available yet.',{exact:false})).toBeVisible();expect(f.discoverCalls()).toBe(0);});

for(const width of [320,375,390,430,768,1440])test(`four-language controls and long Add titles fit ${width}`,async({page})=>{test.skip(!cloudUrl);await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await setup(page);await page.goto('/add');await choose(page,'French');await input(page).fill('Je ne le formulerais pas de cette manière.');await expect(page.getByRole('heading',{name:'Je ne le formulerais pas de cette manière.',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const box=await languageTrigger(page).boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);await languageTrigger(page).click();const menu=await page.getByRole('menu',{name:'Learning Collections',exact:true}).boundingBox();expect(menu!.x).toBeGreaterThanOrEqual(0);expect(menu!.x+menu!.width).toBeLessThanOrEqual(width);await page.keyboard.press('Escape');await page.screenshot({path:`/tmp/noted-collections-${width}.png`,fullPage:true});});

test('missing Collection metadata blocks mixed-language review rather than falling back to English',async({page})=>{test.skip(!cloudUrl);await setup(page);await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',r=>r.fulfill({status:503,json:{message:'Unavailable'}}));await page.goto('/review');await expect(page.getByRole('heading',{name:'Your languages couldn’t be loaded.',exact:true})).toBeVisible();await expect(page.locator('.review-card')).toHaveCount(0);await page.unroute(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot');await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',r=>r.fulfill({json:{version:1,multilingual_enabled:true,learning_ready:true,collections:[en,fr,es,zh]}}));await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(languageTrigger(page)).toHaveAttribute('data-collection-name','English');await expect(page.locator('.review-card')).toContainText('chat');});

test('French and Chinese use the shared TTS controller with the correct locale and manual playback',async({page})=>{
 test.skip(!cloudUrl);const f=await setup(page);await page.addInitScript(()=>{const log:{text:string;lang:string;voice?:string}[]=[];Object.assign(window,{collectionSpeech:log});Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{text:string;lang='';voice:{lang:string}|null=null;onstart:(()=>void)|null=null;onend:(()=>void)|null=null;constructor(text:string){this.text=text}}});Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>['en-GB','fr-FR','es-ES','zh-CN'].map(lang=>({lang,name:lang,voiceURI:lang})),speak:(u:SpeechSynthesisUtterance)=>{log.push({text:u.text,lang:u.lang,voice:u.voice?.lang});queueMicrotask(()=>u.onstart?.({} as SpeechSynthesisEvent))},cancel:()=>{},resume:()=>{},addEventListener:()=>{},removeEventListener:()=>{}}});HTMLMediaElement.prototype.play=function(){return Promise.resolve()};HTMLMediaElement.prototype.pause=function(){};});
 await page.goto('/review');await choose(page,'French');await expect.poll(()=>page.evaluate(()=>(window as unknown as {collectionSpeech:{lang:string}[]}).collectionSpeech.some(row=>row.lang==='fr-FR'))).toBe(true);const before=f.dictionaryCalls();await choose(page,'Simplified Chinese');await expect(page.locator('.review-card h2')).toHaveText('你好');await expect.poll(()=>page.evaluate(()=>(window as unknown as {collectionSpeech:{text:string;lang:string}[]}).collectionSpeech.some(row=>row.lang==='zh-CN'&&row.text==='你好'))).toBe(true);await page.getByRole('switch',{name:'Auto pronunciation',exact:true}).uncheck();const calls=await page.evaluate(()=>(window as unknown as {collectionSpeech:unknown[]}).collectionSpeech.length);await page.getByRole('button',{name:'Play pronunciation',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {collectionSpeech:unknown[]}).collectionSpeech.length)).toBe(calls+1);expect(f.dictionaryCalls()).toBe(before);
});

test('obsolete translation cannot replace a newer French draft or a manually edited meaning',async({page})=>{
 test.skip(!cloudUrl);await setup(page);let release:()=>void=()=>{};await page.route('**/api/collection-lookup',async route=>{if(route.request().postDataJSON().query==='之前的查询'){await new Promise<void>(resolve=>release=resolve);return route.fulfill({json:{items:[{english:'ancienne réponse',meaning:'旧答案',source:'translation'}]}}).catch(()=>{});}return route.fulfill({json:{items:[]}});});await page.goto('/add');await choose(page,'French');await input(page).fill('之前的查询');await page.getByRole('button',{name:'Translate',exact:true}).click();await input(page).fill('un nouveau départ');await page.getByLabel('Meaning',{exact:true}).fill('新的开始，自定义');release();await expect(page.getByRole('heading',{name:'un nouveau départ',exact:true})).toBeVisible();await expect(page.getByLabel('Meaning',{exact:true})).toHaveValue('新的开始，自定义');
});

test('unsaved Expression audio drafts remain local to their Collection and survive a failed vocabulary save',async({page})=>{
 test.skip(!cloudUrl);await setup(page);await page.goto('/add');await input(page).fill('I would not put it that way.');await page.getByLabel('Meaning',{exact:true}).fill('我不会这样说');await page.locator('summary').filter({hasText:'Add a voice note'}).click();const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);await page.getByLabel('Upload audio',{exact:true}).setInputFiles({name:'draft.wav',mimeType:'audio/wav',buffer:wav});await expect(page.getByRole('button',{name:'Preview recording',exact:true})).toBeVisible();await choose(page,'French');await input(page).fill('Je ne dirais pas cela.');await page.locator('summary').filter({hasText:'Add a voice note'}).click();await expect(page.getByRole('button',{name:'Preview recording',exact:true})).toHaveCount(0);await choose(page,'English');await page.locator('summary').filter({hasText:'Add a voice note'}).click();await expect(page.getByRole('button',{name:'Preview recording',exact:true})).toBeVisible();await page.route(cloudOrigin+'/rest/v1/words*',r=>r.request().method()==='POST'?r.fulfill({status:503,json:{message:'Offline fixture'}}):r.fallback());await page.getByRole('button',{name:'Add to my library +',exact:true}).click();await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();await expect(input(page)).toHaveValue('I would not put it that way.');await expect(page.getByRole('button',{name:'Preview recording',exact:true})).toBeVisible();
});

for(const width of [320,375,390,430,768,1440])test(`compact headers, consistent icons and safe scrolling across pages at ${width}`,async({page})=>{
 test.skip(!cloudUrl);await page.setViewportSize({width,height:700});await page.emulateMedia({reducedMotion:'reduce'});await setup(page,{many:true});let icons:string[]=[];
 for(const [path,title,tab]of [['/add','Add.','Add'],['/review?mode=random','Review.','Review'],['/library','Library.','Review'],['/discover','Discover.','Discover'],['/auth','Profile.','Profile']]){
  await page.goto(path);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();const header=page.locator('.learning-header');await expect(header).toHaveCSS('position','sticky');await expect(page.locator('.wb-masthead')).toHaveCount(0);await expect(page.locator('h1')).toHaveCount(1);
  const nav=page.getByRole('navigation',{name:'Main navigation'});await expect(nav.getByRole('link')).toHaveCount(5);const active=nav.getByRole('link',{name:tab,exact:true});await expect(active).toHaveAttribute('aria-current','page');await expect(active.locator('span').first()).toHaveCSS('background-color','rgb(22, 22, 22)');await expect(active.locator('span').first()).toHaveCSS('border-radius','50%');const paths=await nav.locator('svg path').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('d')||''));if(!icons.length)icons=paths;else expect(paths).toEqual(icons);expect(paths[3]).toContain('M20 11a8');expect(paths[4]).toContain('M16 7');
  if(path==='/library'){await page.locator('.word-row').last().scrollIntoViewIfNeeded();const y=(await header.boundingBox())!.y;expect(y).toBeGreaterThanOrEqual(0);expect(y).toBeLessThan(2);await page.locator('.library-back').scrollIntoViewIfNeeded();}
  if(path==='/auth')await expect(languageTrigger(page)).toHaveCount(0);else {await languageTrigger(page).click();await expect(page.getByRole('menuitemradio',{name:'French',exact:true})).toContainText('French');await page.keyboard.press('Escape');await expect(languageTrigger(page)).toBeFocused();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:`/tmp/noted-compact-profile-${width}.png`,fullPage:true});
});

test('dropdown keyboard navigation and selecting the current language preserve the current review session',async({page})=>{test.skip(!cloudUrl);await setup(page,{many:true});await page.goto('/review?mode=random');await page.getByRole('button',{name:'Reveal answer',exact:true}).click();await page.getByRole('button',{name:'Sure',exact:true}).click();await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','1');await choose(page,'English');await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','1');await languageTrigger(page).click();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitemradio',{name:'French',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(languageTrigger(page)).toHaveAttribute('data-collection-name','French');await page.getByRole('link',{name:'Library',exact:true}).click();await expect(page.getByRole('heading',{name:'Library.',exact:true})).toBeVisible();await page.getByLabel('Search library',{exact:true}).fill('猫');await page.locator('.library-back').click();await expect(page).toHaveURL(/review\?mode=random/);await page.getByRole('link',{name:'Library',exact:true}).click();await expect(page.getByLabel('Search library',{exact:true})).toHaveValue('猫');});

test('compact Add remains usable at keyboard height and the language menu clears bottom navigation',async({page})=>{
 test.skip(!cloudUrl);await page.setViewportSize({width:390,height:430});await setup(page);await page.goto('/add');await choose(page,'French');await languageTrigger(page).click();const menu=await page.getByRole('menu',{name:'Learning Collections',exact:true}).boundingBox(),nav=await page.getByRole('navigation',{name:'Main navigation'}).boundingBox();expect(menu!.y+menu!.height).toBeLessThanOrEqual(nav!.y);await page.keyboard.press('Escape');await input(page).fill('Je ne le formulerais pas de cette manière, mais nous pouvons trouver une meilleure solution.');await page.getByLabel('Meaning',{exact:true}).fill('我会换一种说法；可以找到更好的解决方式。');const save=page.getByRole('button',{name:'Add to my library +',exact:true});await save.scrollIntoViewIfNeeded();const bounds=await save.boundingBox(),navigation=await page.getByRole('navigation',{name:'Main navigation'}).boundingBox();expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(navigation!.y);await save.click();await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();await expect(input(page)).not.toBeFocused();const field=await input(page).boundingBox(),header=await page.locator('.learning-header').boundingBox();expect(field!.y).toBeGreaterThanOrEqual(header!.y+header!.height-1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const cached of [false,true])test(`unverified legacy activation cannot enable multilingual controls (cached=${cached})`,async({page})=>{
 test.skip(!cloudUrl);await setup(page,{one:true});
 const legacy={version:1,multilingual_enabled:true,collections:[en]};
 if(cached)await page.addInitScript(({owner,data})=>localStorage.setItem(`noted-collections-v1:${owner}`,JSON.stringify(data)),{owner:user.id,data:legacy});
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',r=>cached?r.fulfill({status:503,json:{message:'Unavailable'}}):r.fulfill({json:legacy}));
 await page.goto('/add');await expect(page.getByRole('heading',{name:'Add a word.',exact:true})).toBeVisible();await expect(languageTrigger(page)).toHaveCount(0);
 await page.goto('/auth');await expect(page.getByRole('button',{name:/Add.*language/i})).toHaveCount(0);
});

test('AI candidates update all learning content without replacing notes or issuing another request', async ({page}) => {
 test.skip(!cloudUrl);
 await page.setViewportSize({width:390,height:844});
 const fixture=await setup(page);
 let calls=0;
 await page.route('**/api/ai-dictionary',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{available:true}});
  calls++;
  const body=route.request().postDataJSON();
  expect(body).toMatchObject({q:'荷花',target:'en',explanation:'zh-CN',context:'Pond plants'});
  expect(JSON.stringify(body)).not.toContain('Private note');
  return route.fulfill({json:{result:{ambiguous:false,candidates:[
   {id:'lotus',english:'lotus',meaning:'荷花',usage:'常用表达',example:'Pink lotuses bloom every summer.',exampleTranslation:'粉色荷花每年夏天盛开。',highlight:'lotuses',partOfSpeech:'名词',source:'ai'},
   {id:'lotus-flower',english:'lotus flower',meaning:'莲花的花朵',usage:'专指花朵',example:'She photographed a lotus flower.',exampleTranslation:'她拍下了一朵莲花。',highlight:'lotus flower',partOfSpeech:'名词短语',source:'ai'},
  ]}}});
 });
 await page.goto('/add');
 await page.screenshot({path:'/tmp/noted-round03-after/add-empty.png'});
 await input(page).fill('荷花');
 await page.getByRole('button',{name:'Context',exact:true}).click();
 await page.getByRole('textbox',{name:'Translation context'}).fill('Pond plants');
 await page.screenshot({path:'/tmp/noted-round03-after/add-translation-context.png'});
 await page.getByRole('button',{name:'Translate with AI',exact:true}).click();
 await expect(page.getByRole('heading',{name:'lotus',exact:true})).toBeVisible();
 await expect(page.locator('mark')).toHaveText('lotuses');
 await expect(page.locator('mark')).toHaveCSS('background-color','rgb(193, 255, 50)');
 await page.screenshot({path:'/tmp/noted-round03-after/add-candidates.png'});
 await page.getByRole('textbox',{name:'My Context'}).fill('Private note');
 await page.getByRole('button',{name:/lotus flower/}).click();
 await expect(page.getByRole('textbox',{name:'Meaning',exact:true})).toHaveValue('莲花的花朵');
 await expect(page.locator('mark')).toHaveText('lotus flower');
 await expect(page.getByText('她拍下了一朵莲花。')).toBeVisible();
 await page.getByRole('button',{name:/Add to my library/}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/noted-round03-after/add-selected-example.png'});
 await expect(page.getByRole('textbox',{name:'My Context'})).toHaveValue('Private note');
 await page.getByRole('button',{name:/^lotus Best match/}).click();
 await expect(page.getByRole('heading',{name:'lotus',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/lotus flower/}).click();
 await page.getByRole('button',{name:/Add to my library/}).click();
 await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();
 expect(fixture.inserts[0]).toMatchObject({word:'lotus flower',meaning:'莲花的花朵',example:'She photographed a lotus flower.',personal_note:'Private note',collection_id:en.id,learning_details:{exampleTranslation:'她拍下了一朵莲花。',highlight:'lotus flower',translationContext:'Pond plants'}});
 await page.goto('/library?q=lotus');
 await page.reload();
 await page.getByRole('button',{name:'Dictionary for lotus flower'}).click();
 await expect(page.getByText('她拍下了一朵莲花。')).toBeVisible();
 await expect(page.getByText('Private note', {exact:false})).toBeVisible();
 await expect(page.getByRole('dialog').locator('mark').first()).toHaveText('lotus flower');
 fixture.rows.splice(0,3);
 await page.goto('/review?mode=random');
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.getByText('她拍下了一朵莲花。')).toBeVisible();
 await expect(page.getByText('Private note', {exact:false})).toBeVisible();
 expect(calls).toBe(1);
});

test('the shared scrollport keeps Home navigation and the end of Profile clear at 320px', async ({page}) => {
 test.skip(!cloudUrl);
 await page.setViewportSize({width:320,height:568});
 await setup(page,{many:true});
 await page.goto('/');
 const navigation=page.getByRole('navigation',{name:'Main navigation'});
 await expect(navigation.getByRole('link',{name:'Home'})).toHaveAttribute('aria-current','page');
 await expect.poll(async()=>Math.round((await navigation.boundingBox())!.y+(await navigation.boundingBox())!.height)).toBe(568);
 await navigation.getByRole('link',{name:'Profile'}).click();
 await expect(page.getByRole('heading',{name:'Profile.'})).toBeVisible();
 await page.screenshot({path:'/tmp/noted-round03-after/profile-languages.png'});
 const legal=page.getByRole('link',{name:'Privacy & terms'});
 await legal.scrollIntoViewIfNeeded();
 await expect(legal).toBeInViewport();
 const calendar=page.locator('.calendar-grid');
 await calendar.getByRole('button').last().scrollIntoViewIfNeeded();
 await page.screenshot({path:'/tmp/noted-round03-after/profile-calendar.png'});
 const day=(await calendar.getByRole('button').last().boundingBox())!;
 expect(day.y+day.height).toBeLessThanOrEqual((await navigation.boundingBox())!.y);
 await page.getByRole('button',{name:'Add a language'}).click();
 const sheet=page.getByRole('dialog',{name:'Add a language'});
 await expect(sheet).toBeVisible();
 await expect(sheet.getByRole('combobox')).toHaveCount(3);
 await page.screenshot({path:'/tmp/noted-round03-after/add-language.png'});
 await page.keyboard.press('Escape');
 await expect(sheet).toHaveCount(0);
});

test('older schemas keep the complete unsaved draft when note storage is unavailable', async ({page}) => {
 test.skip(!cloudUrl);
 const fixture=await setup(page);
 await page.route(cloudOrigin+'/rest/v1/words*',route=>route.request().method()==='POST'
   ? route.fulfill({status:400,json:{code:'PGRST204',message:'Missing fixture column'}}) : route.fallback());
 await page.goto('/add');
 await input(page).fill('personal vocabulary');
 await page.getByRole('textbox',{name:'Meaning',exact:true}).fill('个人词汇');
 await page.getByRole('textbox',{name:'My Context'}).fill('Keep this draft');
 await page.getByRole('button',{name:/Add to my library/}).click();
 await expect(page.getByRole('alert').filter({hasText:'Learning details storage is not ready'})).toBeVisible();
 await expect(input(page)).toHaveValue('personal vocabulary');
 await expect(page.getByRole('textbox',{name:'My Context'})).toHaveValue('Keep this draft');
 expect(fixture.inserts).toHaveLength(0);
});

test('language identities stay consistent across pages and after reopening', async ({page}) => {
 test.skip(!cloudUrl);
 await page.setViewportSize({width:390,height:844});
 await setup(page);
 const shot=(name:string)=>page.screenshot({path:'/tmp/noted-round03-after/'+name+'.png'});
 const color=async (expected:string)=>expect(languageTrigger(page)).toHaveCSS('background-color',expected);
 await page.goto('/');
 await color('rgb(198, 180, 247)');
 await shot('home');
 await page.goto('/add');
 await color('rgb(198, 180, 247)');
 await shot('english-selector');
 await shot('add-empty');
 await page.getByRole('button',{name:'Context',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Translation context'})).toBeVisible();
 await shot('add-translation-context');
 await choose(page,'French');
 await color('rgb(181, 212, 244)');
 await shot('french-selector');
 await choose(page,'Spanish');
 await color('rgb(246, 194, 165)');
 await shot('spanish-selector');
 await languageTrigger(page).click();
 const selected=page.getByRole('menuitemradio',{name:'Spanish'});
 await expect(selected).toHaveAttribute('aria-checked','true');
 await expect(selected.locator('svg')).toHaveCount(1);
 await shot('language-menu');
 await page.keyboard.press('Escape');
 for(const [path,name] of [['/discover','discover'],['/review','review-empty'],['/library','library'],['/','home-spanish']]){
  await page.goto(path);
  await color('rgb(246, 194, 165)');
  await shot(name);
 }
 await expect(languageTrigger(page)).toHaveAttribute('data-collection-name','Spanish');
 await page.goto('/auth');
 await expect(page.getByRole('button',{name:'Settings for Spanish'})).toContainText('Active');
 await expect(page.getByRole('button',{name:'Settings for French'}).locator('.wb-language-mark')).toHaveCSS('background-color','rgb(181, 212, 244)');
 await shot('profile-languages');
 const profileTitle = page.getByRole('heading',{name:'Profile.'});
 const original = await profileTitle.boundingBox();
 await page.getByRole('button',{name:'Settings for French'}).click();
 await shot('language-settings');
 await page.getByRole('button',{name:'Set as active language'}).click();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await expect(page.getByRole('button',{name:'Settings for French'})).toBeFocused();
 expect((await profileTitle.boundingBox())!.y).toBe(original!.y);
 await page.getByRole('button',{name:'Add a language',exact:true}).click();
 await shot('add-language');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(page.locator('.wb-language-list li')).toHaveCount(4);
 const calendar=page.locator('.learning-calendar');
 await calendar.locator('.calendar-day').last().scrollIntoViewIfNeeded();
 await calendar.screenshot({path:'/tmp/noted-round03-after/profile-calendar.png'});
 for(let i=0;i<2;i++){
  const month=(await calendar.locator('.calendar-month h2').innerText()).trim();
  const date=new Date('1 '+month);
  const offset=(date.getDay()+6)%7;
  await expect(calendar.locator('.calendar-grid > span:not(.calendar-weekday)')).toHaveCount(offset);
  await expect(calendar.locator('.calendar-day')).toHaveCount(new Date(date.getFullYear(),date.getMonth()+1,0).getDate());
  await calendar.getByRole('button',{name:'Previous month'}).click();
 }
 await page.goto('/add');
 await color('rgb(181, 212, 244)');
});

test('successful Add saves announce once without moving the input', async ({page}) => {
 test.skip(!cloudUrl);
 await page.setViewportSize({width:390,height:844});
 const store=await setup(page);
 await page.goto('/add');
 await expect(input(page)).toBeVisible();
 const start=await input(page).boundingBox();
 await input(page).fill('notebook entry');
 await page.getByRole('textbox',{name:'Meaning',exact:true}).fill('笔记条目');
 await page.getByRole('button',{name:/Add to my library/}).click();
 const toast=page.locator('.wb-toast');
 await expect(toast).toHaveText('Added to Library');
 await expect(input(page)).toHaveValue('');
 await expect.poll(async()=>(await input(page).boundingBox())?.y).toBe(start?.y);
 const navbar=await page.getByRole('navigation',{name:'Main navigation'}).boundingBox();
 const bounds=await toast.boundingBox();
 expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(navbar!.y);
 await page.screenshot({path:'/tmp/noted-round03-after/add-toast.png'});
 await expect(toast).toHaveCount(0,{timeout:5000});
 expect(store.inserts).toHaveLength(1);
});

test('Review distinguishes empty and caught-up collections', async ({page}) => {
 test.skip(!cloudUrl);
 await page.setViewportSize({width:390,height:844});
 const fixture=await setup(page);
 fixture.rows.forEach(row=>{row.due_at='2099-01-01T00:00:00Z';});
 await page.goto('/review');
 await expect(page.getByRole('heading',{name:'You’re all caught up.'})).toBeVisible();
 await page.screenshot({path:'/tmp/noted-round03-after/review-caught-up.png'});
 await choose(page,'Spanish');
 await expect(page.getByRole('heading',{name:'Start your Spanish collection.'})).toBeVisible();
 await page.getByRole('link',{name:'Add your first word'}).click();
 await expect(languageTrigger(page)).toHaveAttribute('data-collection-name','Spanish');
});

test('Review reports a failed request when no saved offline copy exists', async ({page}) => {
 test.skip(!cloudUrl);
 await setup(page);
 await page.route(cloudOrigin+'/rest/v1/words*',route=>route.fulfill({status:403,json:{message:'Fixture access failure'}}));
 await page.goto('/review');
 await expect(page.getByRole('heading',{name:'Couldn’t load your words.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
});

test('Review keeps loading distinct from an empty collection', async ({page}) => {
 test.skip(!cloudUrl);
 await setup(page);
 let release!: () => void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route(cloudOrigin+'/rest/v1/words*', async route=>{await pending;return route.fallback();});
 await page.goto('/review');
 try {
  await expect(page.getByText('Loading your library…')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Make room for your first word.'})).toHaveCount(0);
 } finally {release();}
 await expect(page.getByRole('button',{name:'Reveal answer'})).toBeVisible();
});

test('Dictionary offers one compact pronunciation control in French, Spanish and Chinese', async ({page}) => {
  test.skip(!cloudUrl);
  await page.setViewportSize({width:320,height:844});
  const fixture=await setup(page);
  fixture.rows.push({...sampleWord,id:ID(13),word:'hola',meaning:'你好',collection_id:es.id});
  await page.route('**/api/collection-reference?*', route=>route.fulfill({json:{items:[]}}));
  await page.goto('/library');
  for(const [language,word] of [['French','chat'],['Spanish','hola'],['Simplified Chinese','你好']]){
    await choose(page,language);
    await page.getByRole('button',{name:'Dictionary for '+word,exact:true}).click();
    const sheet=page.getByRole('dialog',{name:'Dictionary'});
    const control=sheet.getByRole('button',{name:'Play pronunciation',exact:true});
    await expect(control).toHaveCount(1);
    await expect(control).toHaveText('Pronunciation');
    await expect(sheet.locator('[data-accent]')).toHaveCount(0);
    const bounds=await control.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(await sheet.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    await sheet.getByRole('button',{name:'Close',exact:true}).click();
  }
});
