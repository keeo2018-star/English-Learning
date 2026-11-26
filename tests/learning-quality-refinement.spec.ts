import {expect,test,type Page} from '@playwright/test';
import {mockCloud,cloudOrigin,cloudUrl,sampleWord,user} from './helpers/cloud';

const en={id:'88888888-8888-4888-8888-888888888881',user_id:user.id,target_language:'en',explanation_language:'zh-CN',proficiency_level:'A2',display_order:0,preferences:{},created_at:'2026-01-01T00:00:00Z'};
const fr={...en,id:'88888888-8888-4888-8888-888888888882',target_language:'fr',display_order:1};
const fruit='蜜柑，一种柑橘水果';
const clan='The Satsuma clan supported the rebellion in Japan.';
const sentence='She peeled a satsuma and ate the sweet fruit.';
async function fixture(page:Page,ai=false){
 let row={...sampleWord,word:'satsuma',meaning:fruit+'；萨摩藩，日本历史上的氏族。'+('其他历史资料。'.repeat(35)),example:clan,learning_details:null as Record<string,unknown>|null,personal_note:'My original note',collection_id:en.id};
 const writes:Record<string,unknown>[]=[],aiCalls:Record<string,unknown>[]=[];
 await mockCloud(page,route=>{
  if(route.request().method()==='PATCH'){const changes=route.request().postDataJSON();writes.push(changes);row={...row,...changes};return route.fulfill({json:row});}
  return route.fulfill({json:[row]});
 });
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',route=>route.fulfill({json:{version:1,multilingual_enabled:true,learning_ready:true,collections:[en,fr]}}));
 await page.route('**/api/ai-dictionary*',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{available:ai}});
  aiCalls.push(route.request().postDataJSON());return route.fulfill({status:429,json:{message:'Quota exhausted'}});
 });
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:'satsuma',phonetics:[],chinese:[fruit,'萨摩藩，日本历史上的氏族'],english:[{partOfSpeech:'noun',definition:'A citrus fruit.'},{partOfSpeech:'noun',definition:'A historical Japanese clan.'}],examples:[{source:clan,translation:'萨摩氏族支持叛乱。'},{source:sentence,translation:'她剥了一颗蜜柑，吃了甜甜的水果。'}],synonyms:[]}}));
 return {writes,aiCalls,row:()=>row};
}
const openDictionary=async(page:Page)=>{await page.getByRole('button',{name:'Dictionary for satsuma'}).click();return page.getByRole('dialog',{name:'Dictionary'});};
const shot=async(page:Page,name:string)=>{if(process.env.NOTED_VISUALS_DIR)await page.screenshot({path:process.env.NOTED_VISUALS_DIR+'/'+name+'.png'});};
test.skip(!cloudUrl,'Uses an isolated mocked authenticated backend, never production writes.');

for(const width of [320,375,390,430,768,1280])test(`concise sense, progressive Dictionary and safe layout at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});const state=await fixture(page);await page.goto('/review');
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.locator('.wb-meaning-reveal')).toHaveText(fruit);
 await expect(page.locator('[data-context-example]')).toHaveText(sentence);
 await expect(page.locator('[data-context-example]')).not.toContainText('clan');
 expect(state.writes).toHaveLength(0);
 await shot(page,`review-${width}`);
 const sheet=await openDictionary(page);
 const title=sheet.getByRole('heading',{name:'satsuma',exact:true});
 await expect(title).toHaveCSS('letter-spacing','normal');await expect(title).toHaveCSS('text-align','start');
 await expect(sheet.getByRole('heading',{name:'English definitions'})).not.toBeVisible();
 await expect(sheet.getByText('The Satsuma clan supported the rebellion in Japan.',{exact:true}).first()).not.toBeVisible();
 await expect(sheet.getByText('AI learning notes are unavailable in this session.')).toHaveCount(0);
 await expect(page.locator('.wb-app-frame')).toHaveCSS('overflow','hidden');
 const buttons=sheet.getByRole('button',{name:'Play pronunciation',exact:true});
 const uk=(await buttons.nth(0).boundingBox())!,us=(await buttons.nth(1).boundingBox())!;expect(Math.abs(uk.y-us.y)).toBeLessThan(3);
 await sheet.locator('summary').filter({hasText:'Definitions / Other meanings'}).click();
 await expect(sheet.getByRole('heading',{name:'English definitions'})).toBeVisible();
 expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await shot(page,`dictionary-${width}`);
 await sheet.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('.wb-app-frame')).toHaveCSS('overflow','auto');
 expect(state.row().example).toBe(clan);expect(state.writes).toHaveLength(0);
});

test('saved example editing is explicit, preserves scheduling and survives reopening',async({page})=>{
 const state=await fixture(page);await page.goto('/library');const sheet=await openDictionary(page);
 await sheet.getByRole('button',{name:'Edit example',exact:true}).click();
 const input=sheet.getByRole('textbox',{name:'Example sentence'});await input.fill('I enjoyed a satsuma after lunch.');
 await sheet.getByRole('button',{name:'Save example',exact:true}).click();
 expect(state.writes).toHaveLength(1);expect(state.writes[0]).toEqual({example:'I enjoyed a satsuma after lunch.',learning_details:{exampleSource:'personal'}});
 expect(state.row().due_at).toBe(sampleWord.due_at);expect(state.row().meaning).toContain('萨摩藩');
 await sheet.getByRole('button',{name:'Close',exact:true}).click();await page.reload();
 const again=await openDictionary(page);await expect(again.locator('[data-context-example]')).toContainText('I enjoyed a satsuma after lunch.');
});

test('Visual Viewport keeps editor/actions above keyboard, stable reading position and IME node',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>{
  const view=new EventTarget();Object.assign(view,{height:844,width:390,offsetTop:0,offsetLeft:0,pageTop:0,pageLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:view});
  Object.assign(window,{resizeKeyboard:(height:number)=>{Object.assign(view,{height});view.dispatchEvent(new Event('resize'));}});
 });
 const state=await fixture(page);await page.goto('/library');const sheet=await openDictionary(page);
 await sheet.getByRole('button',{name:'Edit my meaning'}).click();const input=sheet.getByRole('textbox',{name:'My meaning',exact:true});
 await input.evaluate(el=>{el.setAttribute('data-original-node','yes');el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'mi'}));(el as HTMLTextAreaElement).value='mi';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'mi'}));});
 await page.evaluate(()=>(window as unknown as {resizeKeyboard:(height:number)=>void}).resizeKeyboard(420));
 await expect(sheet.getByRole('button',{name:'Done',exact:true})).toBeVisible();
 await expect(input).toHaveAttribute('data-original-node','yes');await expect(input).toHaveValue('mi');
 const bounds=(await sheet.boundingBox())!,edit=(await input.boundingBox())!,save=(await sheet.getByRole('button',{name:'Save meaning',exact:true}).boundingBox())!;
 expect(bounds.y+bounds.height).toBeLessThanOrEqual(421);expect(edit.y).toBeGreaterThan(bounds.y);expect(save.y+save.height).toBeLessThanOrEqual(420);
 await input.press('Enter');expect(state.writes).toHaveLength(0);
 await input.evaluate(el=>{(el as HTMLTextAreaElement).value='蜜柑';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'蜜柑'}));});
 await sheet.getByRole('button',{name:'Done',exact:true}).click();
 await page.evaluate(()=>(window as unknown as {resizeKeyboard:(height:number)=>void}).resizeKeyboard(844));
 await sheet.getByRole('button',{name:'Save meaning',exact:true}).click();await expect(sheet.locator('aside p')).toHaveText('蜜柑');
 expect(state.writes).toEqual([{meaning:'蜜柑'}]);await shot(page,'dictionary-after-keyboard');
});

test('AI states are compact, deliberate and quota failure is retryable',async({page})=>{
 const state=await fixture(page,true);await page.goto('/library');const sheet=await openDictionary(page);
 expect(state.aiCalls).toHaveLength(0);await sheet.locator('summary').filter({hasText:'Learning notes'}).click();
 await sheet.getByRole('button',{name:'Generate learning notes'}).click();await expect(sheet.getByRole('region',{name:'AI learning notes'}).getByRole('status')).toContainText('AI request limit reached');
 expect(state.aiCalls).toHaveLength(1);expect(state.aiCalls[0]).toHaveProperty('meaning',fruit);
 await expect(sheet.getByRole('button',{name:'Retry learning notes'})).toBeVisible();
});

test('Related requests time out and can retry without a perpetual loading card',async({page})=>{
 test.setTimeout(25000);await fixture(page);let hanging=true;
 await page.route('**/api/related-words?*',async route=>{if(hanging)await new Promise(resolve=>setTimeout(resolve,10500));try{await route.fulfill({json:{items:[]}});}catch{/* timed out request */}});
 await page.goto('/library');const sheet=await openDictionary(page);await sheet.locator('summary').filter({hasText:'Related & Compare'}).click();
 await expect(sheet.getByRole('button',{name:'Try related words again'})).toBeVisible({timeout:12000});
 hanging=false;await sheet.getByRole('button',{name:'Try related words again'}).click();await expect(sheet.getByText('No reliable connections for this meaning yet.')).toBeVisible();
});

for(const width of [320,390,430])test(`minimal Add, clear focus, multiline and long clipboard at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await fixture(page);await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=> 'word '.repeat(1000)}});});await page.goto('/add');
 const input=page.getByRole('combobox',{name:'Word or phrase'});await expect(input).toBeVisible();const before=(await input.boundingBox())!;
 expect(before.y).toBeLessThan(170);await expect(page.getByRole('region',{name:'Vocabulary card preview'})).toHaveCount(0);await expect(page.getByRole('button',{name:/Add to my library/})).toHaveCount(0);
 await input.click();expect(Math.abs((await input.boundingBox())!.y-before.y)).toBeLessThan(2);
 await input.fill('caught off guard');await page.getByRole('textbox',{name:'Meaning',exact:true}).fill('措手不及');
 await expect(page.getByRole('textbox',{name:'My Context'})).not.toBeVisible();await page.getByText('Add a note',{exact:true}).click();await page.getByRole('textbox',{name:'My Context'}).fill('My personal note');
 await input.fill('A longer expression on the first line\nand a sentence on the next line.');expect((await input.boundingBox())!.height).toBeGreaterThan(before.height);
 await page.getByRole('button',{name:'Context',exact:true}).click();await page.getByRole('button',{name:'Clear input'}).click();await expect(input).toBeFocused();await expect(input).toHaveValue('');await expect(page.getByRole('textbox',{name:'Meaning',exact:true})).toHaveValue('措手不及');
 await page.getByRole('button',{name:'Paste from clipboard'}).click();await expect(input).toHaveValue('word '.repeat(1000).trim());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await shot(page,`add-long-${width}`);
});

test('successful AI notes and grounded comparisons cache across reopening without regenerating',async({page})=>{
 const state=await fixture(page,true);let generated=0;
 await page.route('**/api/ai-dictionary*',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{available:true}});
  generated++;return route.fulfill({json:{result:{word:'satsuma',target:'en',explanationLanguage:'zh-CN',comparisons:[{expression:'mandarin',explanation:'都是柑橘水果，mandarin 是更宽泛的类别。',coreMeaning:'柑橘水果',register:'日常用语',situation:'谈论水果的种类。',example:'I ate a mandarin after lunch.'},{expression:'samurai',explanation:'日本历史上的武士。'}],contexts:['谈论柑橘水果。'],usage:'日常用来指蜜柑。'}}});
 });
 await page.goto('/library');let sheet=await openDictionary(page);await sheet.locator('summary').filter({hasText:'Learning notes'}).click();await sheet.getByRole('button',{name:'Generate learning notes'}).click();await sheet.locator('summary').filter({hasText:'Compare words'}).click();
 await expect(sheet.getByText('mandarin',{exact:true})).toBeVisible();await expect(sheet.getByText('samurai',{exact:true})).toHaveCount(0);await expect(sheet.getByText('I ate a mandarin after lunch.')).toBeVisible();expect(generated).toBe(1);
 await sheet.getByRole('button',{name:'Close',exact:true}).click();sheet=await openDictionary(page);await sheet.locator('summary').filter({hasText:'Learning notes'}).click();await expect(sheet.getByText('日常用来指蜜柑。')).toBeVisible();expect(generated).toBe(1);expect(state.writes).toHaveLength(0);
});

test('failed example save keeps the draft; Cancel and retry never change the meaning or progress',async({page})=>{
 const state=await fixture(page);let fail=true;await page.route(cloudOrigin+'/rest/v1/words*',route=>route.request().method()==='PATCH'&&fail?route.fulfill({status:503,json:{message:'Try again later'}}):route.fallback());
 await page.goto('/library');const sheet=await openDictionary(page);await sheet.getByRole('button',{name:'Edit example',exact:true}).click();const input=sheet.getByRole('textbox',{name:'Example sentence'});await input.fill('I bought a satsuma today.');await sheet.getByRole('button',{name:'Save example',exact:true}).click();await expect(sheet.getByRole('alert')).toBeVisible();await expect(input).toHaveValue('I bought a satsuma today.');expect(state.row().example).toBe(clan);fail=false;await sheet.getByRole('button',{name:'Save example',exact:true}).click();expect(state.row().example).toBe('I bought a satsuma today.');expect(state.row().due_at).toBe(sampleWord.due_at);expect(state.row().meaning).toContain('萨摩藩');
});
