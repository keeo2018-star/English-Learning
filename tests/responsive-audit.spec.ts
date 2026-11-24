import {test,expect} from '@playwright/test';
import {mockCloud,cloudUrl,sampleWord} from './helpers/cloud';
import {mockDiscover,discoverFixture} from './helpers/discover';
const before=process.env.NOTED_LAYOUT_BEFORE==='1';
const examples=Array.from({length:4},(_,i)=>({source:`We should take stock of the situation before making decision ${i+1}.`,translation:`我们应先全面评估当前情况，再作出第${i+1}项决定。`}));
async function setup(page:Parameters<typeof mockCloud>[0],ipa=false){
 const f=discoverFixture();f.ready();await mockDiscover(page,f);
 await page.route('**/rest/v1/words?*',route=>route.fulfill({json:[{...sampleWord,word:'take stock of',meaning:'全面盘点、评估当前情况。'.repeat(10),example:'We should take stock of the situation.'}]}));
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:'take stock of',phonetics:ipa?[{accent:'UK',text:'/teɪk stɒk əv/'},{accent:'US',text:'/teɪk stɑːk əv/'}]:[],chinese:['全面评估当前的情况、资源及进展。'.repeat(8)],english:[{partOfSpeech:'phrase',definition:'To consider a situation carefully before taking action.'}],examples,synonyms:[]}}));
 await page.route('**/api/related-words?*',route=>route.fulfill({json:{items:[{word:'comprehensive evaluation'},{word:'assessment'},{word:'reconsideration'},{word:'review'}]}}));
}
for(const width of [320,375,390,430,768,1440])test(`Dictionary compact controls, examples and scroll at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});await setup(page);await page.goto('/library');
 await page.getByRole('button',{name:'Dictionary for take stock of'}).click();
 const sheet=page.getByRole('dialog');await expect(sheet.getByRole('heading',{name:'Examples',exact:true})).toBeVisible();
 const buttons=sheet.locator('button[data-accent]');
 const rects=await buttons.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{top:r.top,width:r.width,height:r.height}}));
 if(!before){expect(Math.abs(rects[0].top-rects[1].top)).toBeLessThan(2);expect(rects.every(r=>r.width>=44&&r.height>=44)).toBe(true);}
 await page.screenshot({path:`/tmp/noted-layout-${before?'before':'after'}-dictionary-${width}.png`});
 if(before)return;
 await expect(sheet.locator('[data-dictionary-example]')).toHaveCount(2);
 await sheet.getByRole('button',{name:'Show all 4 examples'}).click();await expect(sheet.locator('[data-dictionary-example]')).toHaveCount(4);
 await sheet.getByRole('button',{name:'Show fewer examples'}).click();await expect(sheet.locator('[data-dictionary-example]')).toHaveCount(2);
 await sheet.getByRole('heading',{name:'Related Words',exact:true}).scrollIntoViewIfNeeded();
 expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await expect(sheet.getByRole('button',{name:'Close',exact:true})).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await sheet.getByRole('button',{name:'Close',exact:true}).click();await expect(sheet).toHaveCount(0);
});
for(const width of [320,375,390,430,768,1440])test(`all main screens remain within ${width}px and clear bottom navigation`,async({page})=>{
 test.skip(before);await page.setViewportSize({width,height:844});await setup(page);
 for(const path of ['/','/add','/discover','/review?mode=random','/review','/library','/auth']){
  await page.goto(path);await expect(page.locator('h1').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await expect.poll(async()=>{
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   const bottom=await page.locator('main').evaluate(el=>el.getBoundingClientRect().bottom);
   const nav=await page.getByRole('navigation',{name:'Main navigation'}).boundingBox();
   return nav ? bottom-nav.y : 0;
  },{message:path}).toBeLessThanOrEqual(1);
 }
});
test('IPA wraps only when needed; large text and related cards remain usable',async({page})=>{
 test.skip(before);await page.setViewportSize({width:375,height:844});await setup(page,true);await page.goto('/library');await page.getByRole('button',{name:'Dictionary for take stock of'}).click();const sheet=page.getByRole('dialog');
 await expect(sheet.getByText('/teɪk stɒk əv/')).toBeVisible();
 await page.addStyleTag({content:'html{font-size:24px} [class*=sheet] button{font-size:21px} [class*=sheet] p,[class*=relatedTerm] span{font-size:24px}'});
 const related=sheet.getByRole('region',{name:'Related Words'});await related.scrollIntoViewIfNeeded();
 await expect(related.getByRole('button',{name:/^comprehensive evaluation/})).toBeVisible();
 expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 const sizes=await related.locator('button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));expect(sizes.every(w=>w>=44)).toBe(true);
 await page.screenshot({path:'/tmp/noted-layout-related-large-text.png'});
});
test.skip(!cloudUrl,'Uses isolated Supabase fixtures');

test('short confirmation actions share a row when they fit; focus has one contiguous boundary',async({page})=>{
 test.skip(before);await page.setViewportSize({width:375,height:844});await setup(page);await page.goto('/library');
 await page.getByRole('button',{name:'Delete take stock of',exact:true}).click();
 const dialog=page.getByRole('dialog');const actions=dialog.locator('.actions button');await expect(actions).toHaveCount(2);
 const tops=await actions.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));expect(Math.abs(tops[0]-tops[1])).toBeLessThan(2);
 await page.keyboard.press('Tab');
 const focus=await page.locator(':focus').evaluate(el=>({offset:getComputedStyle(el).outlineOffset,style:getComputedStyle(el).outlineStyle}));
 expect(focus.offset).toBe('0px');expect(focus.style).toBe('solid');
 await dialog.getByRole('button',{name:'Keep word',exact:true}).click();await expect(dialog).toHaveCount(0);
});

for(const word of ['pneumonoultramicroscopicsilicovolcanoconiosis','I wouldn’t put it that way, even if you asked me directly.'])test(`long Dictionary title wraps: ${word}`,async({page})=>{
 test.skip(before);await page.setViewportSize({width:320,height:844});await setup(page);
 await page.route('**/rest/v1/words?*',route=>route.fulfill({json:[{...sampleWord,word}]}));await page.goto('/library');
 await page.getByRole('button',{name:`Dictionary for ${word}`,exact:true}).click();const sheet=page.getByRole('dialog');const title=sheet.getByRole('heading',{name:word,exact:true});await expect(title).toBeVisible();
 expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(title).toHaveCSS('letter-spacing','normal');
});
test('Library action labels fit their buttons with enlarged text at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:844});await setup(page);await page.goto('/library');
 await expect(page.getByRole('button',{name:'Dictionary for take stock of'})).toBeVisible();
 await page.addStyleTag({content:'.word-actions > button {font-size:21px}'});
 const sizes=await page.locator('.word-actions > button').evaluateAll(nodes=>nodes.map(el=>({label:el.textContent,width:el.clientWidth,scroll:el.scrollWidth})));
 if(before){console.log(JSON.stringify(sizes));return;}
 for(const size of sizes){expect(size.width).toBeGreaterThanOrEqual(44);expect(size.scroll,size.label||'action').toBeLessThanOrEqual(size.width+1);}
});
