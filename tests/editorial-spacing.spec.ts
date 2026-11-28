import {expect,test,type Page,type Locator} from '@playwright/test';
import {mockCloud,cloudOrigin,cloudUrl,sampleWord,user} from './helpers/cloud';
import {discoverFixture} from './helpers/discover';
const before=process.env.NOTED_CAPTURE==='before';
const directory=process.env.NOTED_VISUALS_DIR||'/tmp/noted-editorial';
const en={id:'88888888-8888-4888-8888-888888888881',user_id:user.id,target_language:'en',explanation_language:'zh-CN',proficiency_level:'B1',display_order:0,preferences:{},created_at:'2026-01-01T00:00:00Z'};
const collections=[en,{...en,id:'88888888-8888-4888-8888-888888888882',target_language:'fr',display_order:1},{...en,id:'88888888-8888-4888-8888-888888888883',target_language:'es',display_order:2}];
const saved='We considered each section of the document.';
const other='The final section explains how to apply the guidance in a practical situation.';
const translation='最后一部分解释了如何在实际情况下应用这些指导意见。';
const definitions=[{partOfSpeech:'n.',definition:'One part of a larger whole.'},{partOfSpeech:'n.',definition:'A distinct portion of a document, organisation or object, considered separately for a particular purpose.'},{partOfSpeech:'v.',definition:'To divide something into sections.'}];
async function fixture(page:Page){
 const rows=[{...sampleWord,word:'section',meaning:'一部分；段落',example:saved,personal_note:null,learning_details:{exampleSource:'personal',exampleTranslation:'我们考虑了文件的每一部分。'},collection_id:en.id},...collections.slice(1).map((c,i)=>({...sampleWord,id:`44444444-4444-4444-8444-${String(i).padStart(12,'0')}`,word:i?'porción':'portion',meaning:'一部分',example:'',collection_id:c.id}))];
 const writes:unknown[]=[];let aiReads=0;
 await mockCloud(page,route=>{if(route.request().method()==='PATCH'){writes.push(route.request().postDataJSON());return route.fulfill({json:{...rows[0],...route.request().postDataJSON()}});}return route.fulfill({json:rows});});
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',route=>route.fulfill({json:{version:1,multilingual_enabled:true,learning_ready:true,collections}}));
 await page.route(cloudOrigin+'/rest/v1/rpc/learning_collection_calendar',route=>route.fulfill({json:{tracking_since:'2020-01-01T00:00:00Z',days:[]}}));
 await page.route('**/api/ai-dictionary*',route=>{if(route.request().method()==='GET')aiReads++;return route.fulfill({json:{available:false}});});
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:'section',phonetics:[{accent:'UK',text:'/ˈsekʃən/'},{accent:'US',text:'/ˈsekʃən/'}],chinese:['部分；段落','分割，切开'],english:[...definitions,definitions[0]],examples:[{source:saved,translation:'我们考虑了文件的每一部分。'},{source:other,translation},{source:other,translation}],synonyms:[]}}));
 await page.route('**/api/collection-reference?*',route=>route.fulfill({json:{sections:[{partOfSpeech:new URL(route.request().url()).searchParams.get('language')==='fr'?'Nom commun':'Sustantivo',definitions:['A part of a larger whole.','A part of a larger whole.','A limited amount or share intended for a particular purpose.']},{partOfSpeech:'Verbe / Verbo',definitions:['To divide into parts.']}],source:'https://en.wiktionary.org/wiki/portion'}}));
 const discover=discoverFixture();discover.ready();await page.route(cloudOrigin+'/rest/v1/rpc/discover_action',discover.handler);
 return {writes,rows,aiReads:()=>aiReads};
}
async function open(page:Page){await page.goto('/library');await page.getByRole('button',{name:'Dictionary for section',exact:true}).click();return page.getByRole('dialog',{name:'Dictionary'});}
const summary=(sheet:Locator,text:string)=>sheet.locator('summary').filter({hasText:text});
async function shot(page:Page,name:string){await page.screenshot({path:`${directory}/${before?'before':'after'}-${name}.png`});}
async function sectionShot(sheet:Locator,heading:string,name:string,page:Page){await summary(sheet,heading).click();await summary(sheet,heading).scrollIntoViewIfNeeded();await shot(page,name);}

test.skip(!cloudUrl,'Isolated authenticated UI fixtures, no production writes.');
test('six matched editorial comparison scenes at 390px',async({page})=>{
 await page.setViewportSize({width:390,height:844});const state=await fixture(page);const sheet=await open(page);
 await shot(page,'pronunciation');await sectionShot(sheet,'Definitions / Other meanings','definitions',page);
 await summary(sheet,'Definitions / Other meanings').click();await sectionShot(sheet,'More examples','bilingual-examples',page);
 await sectionShot(sheet,'Learning notes','expanded-sections',page);await expect(sheet.getByRole('button',{name:'Check again'})).toBeVisible();
 await sheet.getByRole('button',{name:'Close',exact:true}).click();await page.goto('/auth');
 await page.getByRole('button',{name:'Settings for French'}).click();await page.getByRole('dialog',{name:'Language settings'}).getByRole('button',{name:'Done',exact:true}).click();await shot(page,'profile');
 await page.goto('/discover');await expect(page.getByRole('heading',{name:'Your next 10.',exact:true})).toBeVisible();await shot(page,'discover');
 expect(state.writes).toHaveLength(0);
});

for(const width of [320,375,390,430,768])for(const fontSize of [16,20])test(`compact bilingual reading and definitions ${width}px at ${fontSize}px text`,async({page})=>{
 test.skip(before);await page.setViewportSize({width,height:844});const state=await fixture(page);const sheet=await open(page);
 await page.addStyleTag({content:`html{font-size:${fontSize}px}`});
 const title=sheet.getByRole('heading',{name:'section',exact:true});await expect(title).toHaveCSS('letter-spacing','normal');
 const difference=await sheet.getByRole('group',{name:'Pronunciation and grammar'}).evaluate(el=>{const buttons=el.querySelectorAll('button[data-accent]');return Math.abs(buttons[0].getBoundingClientRect().y-buttons[1].getBoundingClientRect().y);});expect(difference).toBeLessThan(2);
 await summary(sheet,'Definitions / Other meanings').click();const list=sheet.locator('[data-definition-list]').filter({hasText:'One part of a larger whole.'});await expect(list.locator('li')).toHaveCount(3);
 const alignment=await list.locator('li').first().evaluate(el=>{const pos=el.querySelector('[data-grammar]')!.getClientRects()[0],definition=el.querySelector('[data-definition-text]')!.getClientRects()[0];return{dy:Math.abs(pos.y-definition.y),dx:definition.x-pos.x};});expect(alignment.dy).toBeLessThan(7);expect(alignment.dx).toBeGreaterThan(0);
 await summary(sheet,'More examples').click();await expect(sheet.locator('[data-dictionary-example]')).toHaveCount(1);
 for(const pair of [sheet.locator('[data-context-example]'),sheet.locator('[data-dictionary-example]')]){
  const chinese=pair.locator('[data-example-translation]');await expect(chinese).toBeVisible();
  const gap=await pair.evaluate(el=>{const a=el.querySelector('[data-example-source]')!.getBoundingClientRect(),b=el.querySelector('[data-example-translation]')!.getBoundingClientRect();return b.y-a.y-a.height;});expect(gap).toBeGreaterThanOrEqual(3);expect(gap).toBeLessThanOrEqual(9);
  expect(await pair.evaluate(el=>parseFloat(getComputedStyle(el).borderLeftWidth))).toBeGreaterThan(0);
 }
 expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(state.writes).toHaveLength(0);
});

test('Profile pointer restoration stays quiet, keyboard focus remains visible, order and settings work',async({page})=>{
 test.skip(before);await page.setViewportSize({width:390,height:844});await fixture(page);await page.goto('/auth');const row=page.getByRole('button',{name:'Settings for French'});
 await row.click();await page.getByRole('dialog',{name:'Language settings'}).getByRole('button',{name:'Done',exact:true}).click();await expect(row).toBeFocused();await expect(row).toHaveCSS('outline-style','none');
 await row.press('Tab');await page.keyboard.press('Shift+Tab');await expect(row).toBeFocused();await expect(row).toHaveCSS('outline-style','solid');
 await row.press('Enter');await page.keyboard.press('Escape');await expect(row).toBeFocused();await expect(row).toHaveCSS('outline-style','solid');
 const active=page.getByRole('button',{name:'Settings for English'});await expect(active).toContainText('Active');await page.getByRole('button',{name:'Edit order'}).click();await expect(page.getByRole('button',{name:'Move French up'})).toBeVisible();await page.getByRole('button',{name:'Done ordering'}).click();
 await page.locator('.calendar-note').scrollIntoViewIfNeeded();const bottom=(await page.locator('.calendar-note').boundingBox())!,nav=(await page.getByRole('navigation',{name:'Main navigation'}).boundingBox())!;expect(bottom.y+bottom.height).toBeLessThanOrEqual(nav.y);
});

for(const language of ['French','Spanish'])test(`${language} grammar stays inline and all senses remain available`,async({page})=>{
 test.skip(before);await page.setViewportSize({width:375,height:844});await fixture(page);await page.goto('/library');await page.getByRole('button',{name:'Switch learning Collection'}).click();await page.getByRole('menuitemradio',{name:language,exact:true}).click();await page.getByRole('button',{name:language==='French'?'Dictionary for portion':'Dictionary for porción',exact:true}).click();const sheet=page.getByRole('dialog');await summary(sheet,'Definitions / Other meanings').click();await expect(sheet.locator('[data-definition-list] li')).toHaveCount(3);await expect(sheet.getByText('A part of a larger whole.',{exact:true})).toHaveCount(1);
});

test('accordion keeps expanded content mounted and preserves reading scroll after reopening',async({page})=>{
 test.skip(before);await page.setViewportSize({width:390,height:700});const state=await fixture(page);const sheet=await open(page);await summary(sheet,'More examples').click();const details=summary(sheet,'More examples').locator('..');const text=details.getByText(other,{exact:true});await expect(text).toBeVisible();await text.evaluate(el=>el.setAttribute('data-same-node','yes'));await summary(sheet,'More examples').click();await summary(sheet,'More examples').click();await expect(text).toHaveAttribute('data-same-node','yes');
 const status=sheet.getByRole('status').filter({hasText:'AI meaning is unavailable.'});await expect(status).toBeVisible();expect((await status.boundingBox())!.height).toBeLessThan(100);
 await expect(summary(sheet,'Learning notes')).toHaveCount(0);expect(state.aiReads()).toBe(1);
 await status.getByRole('button',{name:'Check again'}).click();await expect.poll(state.aiReads).toBe(2);
});

for(const width of [320,390,430])for(const fontSize of [16,20])test(`Discover keeps vocabulary primary and options usable ${width}px at ${fontSize}px`,async({page})=>{
 test.skip(before);await page.setViewportSize({width,height:844});await fixture(page);await page.goto('/discover');await page.addStyleTag({content:`html{font-size:${fontSize}px}`});
 const card=page.locator('[aria-label="Discover batch"] article');await expect(card).toBeVisible();expect((await card.boundingBox())!.y).toBeLessThan(fontSize===16?270:310);
 const progress=page.getByRole('progressbar',{name:'Discover batch progress'});await expect(progress).toHaveAttribute('value','0');await expect(page.getByText('Picked for your current level.')).toBeVisible();
 await page.getByRole('button',{name:'Reveal meaning'}).click();await page.getByRole('button',{name:'I know it',exact:true}).click();await expect(progress).toHaveAttribute('value','1');
 await page.locator('summary').filter({hasText:'Discover options'}).click();await page.getByRole('button',{name:'Sync progress'}).click();await expect(progress).toHaveAttribute('value','1');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('missing IPA does not create empty pronunciation rows',async({page})=>{
 test.skip(before);await page.setViewportSize({width:320,height:700});await fixture(page);await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:'section',phonetics:[],chinese:[],english:[],examples:[],synonyms:[]}}));const sheet=await open(page);const audio=sheet.getByRole('button',{name:'Play pronunciation',exact:true});const a=(await audio.nth(0).boundingBox())!,b=(await audio.nth(1).boundingBox())!;expect(a.y).toBe(b.y);expect(a.height).toBeGreaterThanOrEqual(44);
});

test('display deduplication ignores spacing without rewriting the saved example',async({page})=>{
 test.skip(before);const state=await fixture(page);const original='We  considered each section of the document.';state.rows[0].example=original;const sheet=await open(page);await summary(sheet,'More examples').click();await expect(sheet.locator('[data-dictionary-example]')).toHaveCount(1);expect(state.rows[0].example).toBe(original);expect(state.writes).toHaveLength(0);
});

test('Chinese grammar metadata uses the same compact inline reading layout',async({page})=>{
 test.skip(before);await page.setViewportSize({width:375,height:844});const state=await fixture(page);const zh={...en,id:'88888888-8888-4888-8888-888888888884',target_language:'zh-CN',explanation_language:'en',display_order:3};state.rows.push({...sampleWord,id:'55555555-5555-4555-8555-555555555555',word:'部分',meaning:'A part of a whole',example:'',collection_id:zh.id});
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',route=>route.fulfill({json:{version:1,multilingual_enabled:true,learning_ready:true,collections:[...collections,zh]}}));
 await page.route('**/api/collection-reference?*',route=>route.fulfill({json:{sections:[{partOfSpeech:'名词',definitions:['A part of a larger whole.']},{partOfSpeech:'动词',definitions:['To divide into parts.']}],source:'https://en.wiktionary.org/wiki/部分'}}));
 await page.goto('/library');await page.getByRole('button',{name:'Switch learning Collection'}).click();await page.getByRole('menuitemradio',{name:'Simplified Chinese',exact:true}).click();await page.getByRole('button',{name:'Dictionary for 部分',exact:true}).click();const sheet=page.getByRole('dialog');await summary(sheet,'Definitions / Other meanings').click();await expect(sheet.locator('[data-definition-list] li')).toHaveCount(2);await expect(sheet.locator('[data-grammar]').first()).toHaveText('名词');expect(await sheet.locator('[data-grammar]').first().evaluate(el=>getComputedStyle(el).display)).toBe('inline');expect(state.writes).toHaveLength(0);
});
