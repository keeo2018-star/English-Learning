import {expect,test,type Page} from '@playwright/test';
import {cloudOrigin,cloudUrl,mockCloud,sampleWord,user} from './helpers/cloud';

const en={id:'88888888-8888-4888-8888-888888888881',user_id:user.id,target_language:'en',explanation_language:'zh-CN',proficiency_level:'A2',display_order:0,preferences:{},created_at:'2026-01-01T00:00:00Z'};
const fr={...en,id:'88888888-8888-4888-8888-888888888882',target_language:'fr',display_order:1};
const words=Array.from({length:38},(_,i)=>({...sampleWord,id:`dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12,'0')}`,
 word:i===0?'callous':i===1?'take care of':`saved term ${i}`,meaning:i===0?'冷酷无情的':'测试释义',collection_id:en.id,due_at:'2001-01-01'}));
const directory=process.env.NOTED_VISUALS_DIR;
const shot=(page:Page,name:string)=>directory?page.screenshot({path:`${directory}/${name}.png`}):Promise.resolve();
async function fixture(page:Page,ai=false,due=true){
 const collections=[en,fr].map(row=>({...row}));
 await mockCloud(page,route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==='HEAD'){
     const total=url.searchParams.get('collection_id')?.includes(fr.id)||(!due&&url.searchParams.has('due_at'))?0:words.length;
     return route.fulfill({headers:{'Access-Control-Expose-Headers':'Content-Range','Content-Range':total?`0-0/${total}`:'*/0'}});
   }
   return route.fulfill({json:words});
 });
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',route=>route.fulfill({json:{version:1,multilingual_enabled:true,learning_ready:true,collections}}));
 await page.route(cloudOrigin+'/rest/v1/learning_collections*',route=>{
   const row=collections.find(item=>route.request().url().includes(item.id))!;
   Object.assign(row,route.request().postDataJSON());
   return route.fulfill({json:row});
 });
 await page.route(cloudOrigin+'/rest/v1/rpc/learning_collection_calendar',route=>route.fulfill({json:{tracking_since:'2020-01-01T00:00:00Z',days:[]}}));
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{
   word:'callous',phonetics:[{accent:'UK',text:'/ˈkæləs/'},{accent:'US',text:'/ˈkæləs/'}],
   chinese:['冷酷无情的','硬化的'],english:[{partOfSpeech:'adjective',definition:'Showing no sympathy.'},{partOfSpeech:'adjective',definition:'Hardened through wear.'}],
   examples:[{source:'That was a callous remark.',translation:'那是冷酷无情的话。'},{source:'They seemed callous.',translation:'他们似乎很冷漠。'}],
   synonyms:[],
 }}));
 const calls:Record<string,unknown>[]=[];
 await page.route('**/api/ai-dictionary*',route=>{
   if(route.request().method()==='GET')return route.fulfill({json:{available:ai}});
   calls.push(route.request().postDataJSON());
   return route.fulfill({json:{result:{word:'callous',target:'en',explanationLanguage:'zh-CN',
     comparisons:[{expression:'insensitive',explanation:'冷酷无情，强调没有顾及对方的感受。'}],
     collocations:[{expression:'callous remark',explanation:'冷酷无情的话。'}],
     contexts:['谈论某人对别人的痛苦的反应。'],usage:'通常带有批评意味。'}}});
 });
 return calls;
}

for(const width of [320,375,390,430,1024])test(`Library and Dictionary remain scrollable at ${width}px`,async({page})=>{
 test.skip(!cloudUrl);
 await page.setViewportSize({width,height:844});
 const calls=await fixture(page,true);
 await page.goto('/library');
 const count=page.getByRole('status',{name:'Library count'});
 await expect(count).toContainText('38 saved items');
 const header=await page.locator('.learning-header').boundingBox();
 expect((await count.boundingBox())!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
 const row=page.getByRole('button',{name:'Dictionary for callous'});
 await expect(page.getByRole('button',{name:'Delete callous'})).toHaveCount(0);
 expect((await row.boundingBox())!.height).toBeLessThan(92);
 if(width===390)await shot(page,'library');
 await row.click();
 const sheet=page.getByRole('dialog',{name:'Dictionary'});
 const close=sheet.getByRole('button',{name:'Close'});
 await expect(sheet.getByRole('heading',{name:'Dictionary',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(close).toBeFocused();
 await expect(sheet.getByRole('heading',{name:'callous',exact:true})).toBeVisible();
 await expect(sheet.getByText('冷酷无情的',{exact:true}).first()).toBeVisible();
 expect((await close.locator('svg').boundingBox())!.width).toBe(20);
 if(width===390)await shot(page,'dictionary');
 await sheet.locator('summary').filter({hasText:/More examples/}).click();
 await expect(sheet.getByText('They seemed callous.')).toBeVisible();
 expect(calls).toHaveLength(0);
 if(width===390)await shot(page,'dictionary-examples');
 await sheet.locator('summary').filter({hasText:'Learning notes'}).click();await sheet.getByRole('button',{name:'Generate learning notes'}).click();
 await sheet.locator('summary').filter({hasText:'Compare words'}).click();
 const notes=sheet.getByRole('region',{name:'AI learning notes'});
 await expect(notes.getByText('insensitive',{exact:true})).toBeVisible();
 await expect(notes.getByText('callous remark',{exact:true})).toBeVisible();
 await expect(notes.getByText('通常带有批评意味。')).toBeVisible();
 expect(calls).toEqual([{mode:'enrichment',consent:true,q:'callous',target:'en',explanation:'zh-CN',level:'A2',partOfSpeech:'adjective',meaning:'冷酷无情的'}]);
 if(width===390){
   await notes.screenshot({path:`${directory||'/tmp'}/dictionary-learning-notes.png`});
   await shot(page,'library-details');
 }
 await expect(close).toBeInViewport();
 await close.click();
 await expect(row).toBeFocused();
 expect(await page.locator('#app-content').evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('a missing dictionary reference keeps saved content and the pronunciation actions',async({page})=>{
 test.skip(!cloudUrl);await fixture(page);
 await page.route('**/api/dictionary?*',route=>route.fulfill({status:404,json:{message:'Reference missing'}}));
 await page.goto('/library');
 await page.getByRole('button',{name:'Dictionary for callous'}).click();
 const sheet=page.getByRole('dialog',{name:'Dictionary'});
 await expect(sheet.getByText('Saved example · check meaning',{exact:true})).toBeVisible();
 await expect(sheet.getByText('冷酷无情的',{exact:true})).toBeVisible();
 await expect(sheet.getByRole('button',{name:'Play pronunciation',exact:true})).toHaveCount(2);
});
test('Profile menus open above the sheet, Escape returns to the selector and close returns to the row',async({page})=>{
 test.skip(!cloudUrl);
 await page.setViewportSize({width:390,height:844});await fixture(page);await page.goto('/auth');
 await shot(page,'profile');
 const row=page.getByRole('button',{name:'Settings for French'});
 await row.click();
 const sheet=page.getByRole('dialog',{name:'Language settings'});
 await shot(page,'language-settings');
 const opener=sheet.getByRole('button',{name:'Explanation language for French'});
 await opener.click();
 await expect(sheet.getByRole('menuitemradio',{name:'English',exact:true})).toBeVisible();
 await shot(page,'explanation-dropdown');
 await page.keyboard.press('Escape');
 await expect(opener).toBeFocused();
 await expect(sheet).toBeVisible();
 const level=sheet.getByRole('button',{name:'Level for French'});
 await level.click();
 await shot(page,'level-dropdown');
 await sheet.getByRole('menuitemradio',{name:'B1',exact:true}).click();
 await expect(level).toContainText('B1');
 await sheet.getByRole('button',{name:'Close'}).click();
 await expect(row).toBeFocused();
 await expect(row).toContainText('B1');
 await shot(page,'profile-after-close');
 await page.getByRole('button',{name:'Calendar language'}).click();
 await shot(page,'calendar-dropdown');
 await page.getByRole('menuitemradio',{name:'French',exact:true}).click();
 await page.locator('.learning-calendar').scrollIntoViewIfNeeded();
 await shot(page,'calendar');
});

test('Home due and caught-up counts, and Review share compact pronunciation and safe deletion',async({page})=>{
 test.skip(!cloudUrl);
 await page.setViewportSize({width:390,height:844});await fixture(page);await page.goto('/');
 await expect(page.getByRole('link',{name:'Start reviewing'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Library'})).toContainText('38 saved items');
 await shot(page,'home-due');
 await page.getByRole('link',{name:'Start reviewing'}).click();
 const toggle=page.getByRole('switch',{name:'Auto pronunciation'});
 await expect(toggle).toBeVisible();
 expect((await toggle.locator('..').locator('svg').boundingBox())!.width).toBe(20);
 await shot(page,'review-due');
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await shot(page,'review-revealed');
 await page.getByRole('button',{name:/Dictionary for/}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 await expect(page.getByRole('button',{name:/Dictionary for/})).toBeFocused();
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible();
 await shot(page,'review-after-dictionary');
 await page.getByRole('button',{name:'Random review',exact:true}).click();
 await expect(toggle).toBeVisible();
 await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','0');
 await shot(page,'review-random');
 await page.getByRole('button',{name:'Delete entry'}).click();
 const confirm=page.getByRole('dialog',{name:'Delete this entry?'});
 await expect(confirm).toContainText('will be removed from your library');
 await confirm.getByRole('button',{name:'Cancel'}).click();
 await expect(page.getByRole('progressbar',{name:'Items reviewed'})).toHaveAttribute('value','0');
 await fixture(page,false,false);
 await page.goto('/');
 await expect(page.getByText('All caught up. No words due right now.')).toBeVisible();
 await shot(page,'home-caught-up');
});

for(const width of [320,375,390,430])test(`meaning editor stays above the simulated keyboard at ${width}px`,async({page})=>{
 test.skip(!cloudUrl);
 await page.setViewportSize({width,height:844});
 await fixture(page,true);
 await page.addInitScript(()=>{
   const viewport=window.visualViewport!;
   let height=844;
   Object.defineProperty(viewport,'height',{get:()=>height});
   Object.assign(window,{notedSimulateViewport:(value:number)=>{height=value;viewport.dispatchEvent(new Event('resize'));}});
 });
 await page.goto(width===390?'/review':'/library');
 if(width===390)await page.getByRole('button',{name:'Reveal answer'}).click();
 const trigger=page.getByRole('button',{name:'Dictionary for callous'});
 await trigger.click();
 const dictionary=page.getByRole('dialog',{name:'Dictionary'});
 await expect(dictionary).toHaveCSS('text-align','start');
 await expect(dictionary.locator('[data-context-example]').first()).toBeVisible();
 expect(await dictionary.locator('[data-context-example]').first().evaluate(el=>getComputedStyle(el,'::before').content)).toBe('none');
 if(width===390)await shot(page,'dictionary-review');
 const viewportSize=async(value:number)=>page.evaluate(h=>(window as unknown as {notedSimulateViewport:(h:number)=>void}).notedSimulateViewport(h),value);
 const shell=page.locator('.wb-app'),height=(await shell.boundingBox())!.height;
 await dictionary.getByRole('button',{name:'Edit my meaning'}).click();
 const editor=page.getByRole('dialog',{name:'Edit meaning'});
 const input=editor.getByRole('textbox',{name:'My meaning'});
 await expect(input).toBeFocused();
 if(width===390)await shot(page,'meaning-editor');
 await viewportSize(360);
 await expect(page.locator('.wb-app-navigation')).toHaveCSS('visibility','hidden');
 expect((await shell.boundingBox())!.height).toBe(height);
 await input.fill('長い説明 / A longer meaning. '.repeat(25));
 expect((await editor.getByRole('button',{name:'Save meaning'}).boundingBox())!.y).toBeLessThan(360);
 expect((await editor.getByRole('button',{name:'Cancel',exact:true}).boundingBox())!.y).toBeLessThan(360);
 if(width===390)await shot(page,'meaning-simulated-keyboard');
 await input.blur();
 await expect(page.locator('.wb-app-navigation')).toHaveCSS('visibility','hidden');
 expect((await editor.getByRole('button',{name:'Cancel',exact:true}).boundingBox())!.y).toBeLessThan(360);
 await editor.getByRole('button',{name:'Cancel',exact:true}).click();
 await viewportSize(844);
 await expect(dictionary.getByRole('button',{name:'Edit my meaning'})).toBeFocused();
 await expect(dictionary.getByText('冷酷无情的',{exact:true}).first()).toBeVisible();
 if(width===390)await shot(page,'dictionary-after-cancel');
 await dictionary.getByRole('button',{name:'Close'}).click();
 await expect(trigger).toBeFocused();
 if(width===390)await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible();
});

test('a missing exact phrase keeps the original entry and offers an explicit headword lookup',async({page})=>{
 test.skip(!cloudUrl);
 await fixture(page);
 await page.route('**/api/dictionary?*',route=>route.fulfill({status:404,json:{message:'No exact entry'}}));
 await page.goto('/library');
 await page.getByRole('button',{name:'Dictionary for take care of'}).click();
 const sheet=page.getByRole('dialog',{name:'Dictionary'});
 await expect(sheet.getByText(/No exact reference for this expression/)).toBeVisible();
 await expect(sheet.getByRole('heading',{name:'take care of'})).toBeVisible();
 await expect(sheet.getByRole('button',{name:'Try again'})).toHaveCount(0);
 await expect(sheet.getByRole('button',{name:'Look up first word: take'})).toBeVisible();
 await shot(page,'missing-exact-entry');
});

test('shared page grid and ordinary selection remain stable',async({page})=>{
 test.skip(!cloudUrl);
 await page.setViewportSize({width:390,height:844});
 await fixture(page);
 for(const [path,name] of [['/','home'],['/add','add-idle'],['/discover','discover'],['/review','review-due'],['/library','library'],['/auth','profile']]){
   await page.goto(path);
   await expect(page.getByRole('main')).toBeVisible();
   await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await shot(page,name);
 }
 const setting=page.getByRole('button',{name:'Settings for French'});
 await setting.click();
 await expect(page.getByRole('dialog',{name:'Language settings'})).toBeVisible();
 await shot(page,'language-settings');
 await page.getByRole('dialog').getByRole('button',{name:'Close'}).click();
 await page.goto('/library');
 const words=page.getByRole('button',{name:'Words',exact:true});
 const geometry=()=>words.evaluate(el=>({height:el.getBoundingClientRect().height,border:getComputedStyle(el).borderTopWidth}));
 const before=await geometry();
 await words.click();
 await expect(words).toHaveAttribute('aria-pressed','true');
 expect(await geometry()).toEqual(before);
 await shot(page,'library-selected');
});
