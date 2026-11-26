import { test, expect, type Locator } from '@playwright/test';
import { mockCloud, cloudUrl, sampleWord, user } from './helpers/cloud';

test.skip(!cloudUrl,'Requires public Supabase configuration');
const sentence='Finding this book was pure serendipity.';
async function exampleSentence(example: Locator) {
 await expect(example).toBeVisible();
 return example.evaluate(node => Array.from(node.childNodes)
   .filter(child => !(child instanceof HTMLElement && child.tagName==='SMALL'))
   .map(child => child.textContent).join('').trim());
}
async function fixture(page: Parameters<typeof mockCloud>[0], options: {example?:string;word?:string;meaning?:string;fail?:boolean;conflict?:boolean;persistFail?:boolean}={}) {
 let row={...sampleWord,example:options.example||'',word:options.word||sampleWord.word,meaning:options.meaning||'意外发现'};
 let writes=0,lookups=0;
 await mockCloud(page,async route=>{
  const req=route.request();
  if(req.method()==='PATCH'){
   writes++;
   if(options.persistFail){await route.fulfill({status:503,json:{message:"Connection interrupted"}});return;}
   const url=new URL(req.url());
   expect(url.searchParams.get('user_id')).toBe('eq.'+user.id);
   expect(url.searchParams.get('example')).toBe('eq.');
   expect(url.searchParams.get('meaning')).toBe('eq.'+row.meaning);
   if(options.conflict){row={...row,example:'My own example, edited on another device.'};await route.fulfill({json:null});return;}
   row={...row,...req.postDataJSON()};await route.fulfill({json:row});return;
  }
  const url=new URL(req.url());
  await route.fulfill({json:url.searchParams.has('id')?row:[row]});
 });
 await page.route('**/api/dictionary?*',async route=>{
  lookups++;
  if(options.fail){await route.fulfill({status:503,json:{message:'Unavailable'}});return;}
  await route.fulfill({json:{word:row.word,phonetics:[],chinese:[row.meaning],english:[],synonyms:[],examples:[{source:row.word==='caught off guard'?'She was caught off guard by the question.':sentence,translation:row.word==='caught off guard'?'这个问题让她措手不及。':'发现这本书纯属意外发现。'}]}});
 });
 return {row:()=>row,writes:()=>writes,lookups:()=>lookups};
}
test('old Word receives one persisted example after reveal, highlighted; reload uses saved value',async({page})=>{
 const f=await fixture(page);
 await page.goto('/review');
 await expect(page.getByRole('button',{name:'Reveal answer'})).toBeVisible();
 await expect(page.locator('[data-context-example]')).toHaveCount(0);
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.locator('[data-context-example]')).toHaveText(sentence);
 await expect(page.locator('[data-context-example] mark')).toHaveText('serendipity');
 await expect.poll(f.writes).toBe(1);
 expect(f.row().example).toBe(sentence);
 expect(f.lookups()).toBe(1);
 await page.reload();await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.locator('[data-context-example]')).toHaveText(sentence);
 expect(f.writes()).toBe(1);
});
test('existing personal example wins without cloud backfill',async({page})=>{
 const personal='I found serendipity in my own story.';
 const f=await fixture(page,{example:personal});
 await page.goto('/library');
 await page.getByRole('button',{name:'Dictionary for '+sampleWord.word,exact:true}).click();
 expect(await exampleSentence(page.getByRole('dialog').locator('[data-context-example]'))).toBe(personal);
 expect(f.writes()).toBe(0);
});
test('Expression receives a complete contextual example',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const f=await fixture(page,{word:'caught off guard',meaning:'措手不及'});
 await page.goto('/review?mode=random');
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.locator('[data-context-example]')).toHaveText('She was caught off guard by the question.');
 await expect(page.locator('[data-context-example] mark')).toHaveText('caught off guard');
 await expect.poll(f.writes).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'/tmp/noted-context-expression-mobile.png',fullPage:true});
});
test('concurrent personal edit wins conditional update',async({page})=>{
 await fixture(page,{conflict:true});await page.goto('/library');
 await page.getByRole('button',{name:'Dictionary for '+sampleWord.word,exact:true}).click();
 expect(await exampleSentence(page.getByRole('dialog').locator('[data-context-example]'))).toBe('My own example, edited on another device.');
});
test('dictionary failure leaves Review usable',async({page})=>{
 const f=await fixture(page,{fail:true});await page.goto('/review');
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeEnabled();
 await expect(page.locator('[data-context-example]')).toHaveCount(0);
 expect(f.writes()).toBe(0);
});
test('cached example remains available during disconnected Review, even after a failed cloud sync',async({page,context})=>{
 await fixture(page,{persistFail:true});await page.goto('/review');
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.locator('[data-context-example]')).toHaveText(sentence);
 await page.reload();
 await expect(page.getByRole('button',{name:'Reveal answer'})).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));
 await context.setOffline(true);
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.locator('[data-context-example]')).toHaveText(sentence);
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeEnabled();
});
test('new Add without a personal context receives dictionary context after confirmed save',async({page})=>{
 let row: Record<string,unknown>|null=null;
 await mockCloud(page,async route=>{
  const request=route.request();
  if(request.method()==='POST'){row={...sampleWord,...request.postDataJSON()};await route.fulfill({json:row});return;}
  if(request.method()==='PATCH'){row={...row,...request.postDataJSON()};await route.fulfill({json:row});return;}
  await route.fulfill({json:new URL(request.url()).searchParams.has('id')?row:row?[row]:[]});
 });
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:'serendipity',phonetics:[],chinese:[],english:[],synonyms:[],examples:[{source:sentence,translation:'意外发现这本书。'}]}}));
 await page.goto('/add');
 await page.getByRole('combobox',{name:'Word or phrase'}).fill('serendipity');
 await page.getByLabel('Meaning',{exact:true}).fill('意外发现');
 await page.getByRole('button',{name:'Add to my library +',exact:true}).click();
 await expect.poll(()=>row?.example).toBe(sentence);
 await expect.poll(()=>row).toMatchObject({interval_days:0});
 await expect(page.getByRole('combobox',{name:'Word or phrase'})).toHaveValue('');
});
test('no dictionary examples leaves no empty example container',async({page})=>{
 await fixture(page);
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:'serendipity',phonetics:[],chinese:[],english:[],synonyms:[],examples:[]}}));
 await page.goto('/review');await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeEnabled();
 await expect(page.locator('[data-context-example]')).toHaveCount(0);
});
