import {test,expect} from '@playwright/test';
import {cloudUrl,cloudOrigin} from './helpers/cloud';
import {discoverFixture,mockDiscover,dailyItems} from './helpers/discover';
test.describe('Discover',()=>{
 test.skip(!cloudUrl,'Requires configured cloud fixture');
 test('assessment is voluntary, adaptive requests persist, result estimated and retake available',async({page})=>{
  const f=await mockDiscover(page);await page.goto('/discover');
  await expect(page.getByRole('heading',{name:'Let’s find your level.'})).toBeVisible();
  await page.getByRole('button',{name:'Start vocabulary check',exact:true}).click();
  await expect(page.getByRole('progressbar',{name:'Vocabulary check progress'})).toHaveAttribute('value','0');
  for(let i=0;i<16;i++){
   if(i%3===0) await page.getByRole('button',{name:'I don’t know',exact:true}).click();
   else await page.getByRole('group',{name:'Meaning choices'}).getByRole('button').first().click();
   if(i<15) await expect(page.getByRole('progressbar',{name:'Vocabulary check progress'})).toHaveAttribute('value',String(i+1));
  }
  await expect(page.getByRole('heading',{name:'B2 · Estimated'})).toBeVisible();
  await expect(page.getByText(/not a certified measure/)).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'B2 · Estimated'})).toBeVisible();
  await page.getByRole('button',{name:'Discover my next words'}).click();await expect(page.getByRole('heading',{name:'Your next 10.'})).toBeVisible();
  await page.getByText('Discover options',{exact:true}).click();await page.getByRole('button',{name:'Retake vocabulary check'}).click();
  await expect(page.getByRole('progressbar',{name:'Vocabulary check progress'})).toHaveAttribute('value','0');expect(f.calls.filter(x=>x.action==='assessment_start')).toHaveLength(2);
 });
 test('skip is remembered, reveal does not count, know/save persist and completion stays minimal',async({page})=>{
  const f=await mockDiscover(page);await page.goto('/discover');await page.getByRole('button',{name:'Skip for now'}).click();
  await expect(page.getByRole('heading',{name:dailyItems[0].word,exact:true})).toBeVisible();
  await expect(page.getByText(dailyItems[0].meaning,{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Play pronunciation'})).toBeVisible();
  await page.getByRole('button',{name:'Reveal meaning'}).click();await expect(page.getByText(dailyItems[0].meaning,{exact:true})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Discover batch progress'})).toHaveAttribute('value','0');expect(f.calls.filter(x=>x.action==='daily_response')).toHaveLength(0);
  await page.getByRole('button',{name:'Save to Library'}).click();await expect(page.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();expect(f.library).toHaveLength(1);
  await page.reload();await expect(page.getByRole('heading',{name:'Let’s find your level.'})).toHaveCount(0);await expect(page.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();
  for(let i=1;i<10;i++){await page.getByRole('button',{name:'Reveal meaning'}).click();await page.getByRole('button',{name:'I know it',exact:true}).click();if(i<9)await expect(page.getByRole('heading',{name:dailyItems[i+1].word,exact:true})).toBeVisible();}
  await expect(page.getByRole('heading',{name:'Nice work.'})).toBeVisible();await expect(page.getByText('You’ve explored 10 words.')).toBeVisible();await expect(page.getByRole('button',{name:'Discover 10 more'})).toBeVisible();expect(f.library).toHaveLength(1);
  await page.getByRole('link',{name:'Open Library'}).click();await expect(page.getByRole('heading',{name:dailyItems[0].word,exact:true})).toBeVisible();
 });
 test('a lost response retries without duplicate Library entries or progress',async({page})=>{
  const f=discoverFixture();f.ready();await mockDiscover(page,f);await page.goto('/discover');await page.getByRole('button',{name:'Reveal meaning'}).click();f.loseNextResponse();
  await page.getByRole('button',{name:'Save to Library'}).click();await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();expect(f.library).toHaveLength(1);
  await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();expect(f.library).toHaveLength(1);expect(Object.keys(f.state.daily!.responses)).toHaveLength(1);
 });
 test('unfinished batches resume on another device and remain fixed across local dates',async({browser})=>{
  const f=discoverFixture();f.ready();const a=await browser.newPage({baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3000'}),b=await browser.newPage({baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3000'});
  try {await mockDiscover(a,f);await mockDiscover(b,f);await a.goto('/discover');await a.getByRole('button',{name:'Reveal meaning'}).click();await a.getByRole('button',{name:'I know it',exact:true}).click();
   await b.goto('/discover');await expect(b.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();
   const original=f.state.daily!.id;f.nextDate('2030-01-02');await b.reload();
   await expect(b.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();expect(f.state.daily!.id).toBe(original);

  }finally{await a.close();await b.close();}
 });
 for(const width of [320,390,1440])test(`blue cards, controls and navigation fit ${width}`,async({page})=>{
  await page.setViewportSize({width,height:844});const f=discoverFixture();f.ready();await mockDiscover(page,f);await page.goto('/discover');
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Discover',exact:true})).toHaveAttribute('aria-current','page');
  await page.getByRole('button',{name:'Reveal meaning'}).click();await expect(page.getByRole('button',{name:'Save to Library'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('article').first()).toHaveCSS('background-color','rgb(140, 184, 255)');await page.screenshot({path:`/tmp/noted-discover-${width}.png`});
 });
 test('missing schema is an honest setup state and can recover',async({page})=>{
  const f=await mockDiscover(page);let missing=true;await page.route(cloudOrigin+'/rest/v1/rpc/discover_action',route=>missing?route.fulfill({status:404,json:{code:'PGRST202',message:'function not found'}}):f.handler(route));
  await page.goto('/discover');await expect(page.getByText(/one-time setup/)).toBeVisible();await expect(page.getByRole('button',{name:'Start vocabulary check'})).toHaveCount(0);
  missing=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('heading',{name:'Let’s find your level.'})).toBeVisible();
 });
 test('pronunciation uses the shared controller and stops when advancing',async({page})=>{
  await page.addInitScript(()=>{
   const spoken:string[]=[];let cancellations=0;const target=new EventTarget();
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'English UK',lang:'en-GB',voiceURI:'test'}],speak:(utterance:SpeechSynthesisUtterance)=>spoken.push(utterance.text),cancel:()=>{cancellations++},addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target)}});
   Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class{text:string;constructor(text:string){this.text=text}}});
   Object.assign(window,{discoverSpoken:spoken,discoverCancels:()=>cancellations});
  });
  const f=discoverFixture();f.ready();await mockDiscover(page,f);await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:dailyItems[0].word,phonetics:[],chinese:[],english:[],examples:[],synonyms:[]}}));
  await page.goto('/discover');await page.getByRole('button',{name:'Play pronunciation'}).click();
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'discoverSpoken'))).toEqual([dailyItems[0].word]);
  const before=await page.evaluate(()=>Reflect.get(window,'discoverCancels')());
  await page.getByRole('button',{name:'Reveal meaning'}).click();await page.getByRole('button',{name:'I know it',exact:true}).click();
  await expect(page.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Reflect.get(window,'discoverCancels')())).toBeGreaterThan(before);
 });
 test('limited remaining vocabulary uses the actual count and installed PWA still works',async({page})=>{
  const f=discoverFixture();f.ready();f.state.daily!.items=f.state.daily!.items.slice(0,2);f.state.daily!.item_ids=f.state.daily!.items.map(x=>x.id);f.state.daily!.remaining_count=0;
  await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));await mockDiscover(page,f);await page.goto('/discover');await expect(page.getByRole('heading',{name:'Your next picks.'})).toBeVisible();
  for(let i=0;i<2;i++){await page.getByRole('button',{name:'Reveal meaning'}).click();await page.getByRole('button',{name:'I know it',exact:true}).click();if(i===0)await expect(page.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();}
  await expect(page.getByRole('heading',{name:'Nice work.'})).toBeVisible();await expect(page.getByText('You’ve explored 2 words.')).toBeVisible();await expect(page.getByText(/No new words are available/)).toBeVisible();await expect(page.getByRole('button',{name:'Discover 10 more'})).toHaveCount(0);
 });
 test('multiple ten-word batches show summaries, reset progress and survive a lost next-batch response',async({page,browserName})=>{
  const f=discoverFixture();f.ready();await mockDiscover(page,f);await page.goto('/discover');
  const seen=new Set<string>();
  for(let batch=0;batch<3;batch++){
   await expect(page.getByRole('progressbar',{name:'Discover batch progress'})).toHaveAttribute('value','0');
   for(let i=0;i<10;i++){
    const heading=page.locator('.wb-learning-card h2');const word=(await heading.textContent())!;expect(seen.has(word)).toBe(false);seen.add(word);
    await page.getByRole('button',{name:'Reveal meaning'}).click();await page.getByRole('button',{name:i<3?'Save to Library':'I know it',exact:true}).click();
    if(i<9)await expect(page.getByRole('progressbar',{name:'Discover batch progress'})).toHaveAttribute('value',String(i+1));
   }
   await expect(page.getByRole('heading',{name:'Nice work.'})).toBeVisible();await expect(page.getByText('You’ve explored 10 words.')).toBeVisible();
   const stats=page.locator('dl');await expect(stats.locator('div').filter({hasText:'Saved'})).toHaveText('Saved3');await expect(stats.locator('div').filter({hasText:'Already known'})).toHaveText('Already known7');
   if(batch===0)await page.screenshot({path:`/tmp/noted-discover-complete-${browserName}.png`});
   if(batch<2){
    const previous=f.state.daily!.id;
    if(batch===0)f.loseNextResponse();
    await page.getByRole('button',{name:'Discover 10 more'}).click();
    if(batch===0){await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();await page.getByRole('button',{name:'Try again'}).click();}
    await expect(page.getByRole('heading',{name:'Your next 10.'})).toBeVisible();expect(f.state.daily!.id).not.toBe(previous);expect(f.history.size).toBe(batch+2);
   }
  }
  expect(seen.size).toBe(30);expect(f.library).toHaveLength(9);expect(f.history.size).toBe(3);
 });
 test('a failed save keeps the revealed word available for retry',async({page})=>{
  const f=discoverFixture();f.ready();await mockDiscover(page,f);await page.goto('/discover');await page.getByRole('button',{name:'Reveal meaning'}).click();f.failNext('daily_response');await page.getByRole('button',{name:'Save to Library'}).click();
  await expect(page.getByRole('heading',{name:dailyItems[0].word,exact:true})).toBeVisible();expect(f.library).toHaveLength(0);await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('heading',{name:dailyItems[1].word,exact:true})).toBeVisible();expect(f.library).toHaveLength(1);
 });
 test('the next batch started on one device is current on another device',async({browser})=>{
  const f=discoverFixture();f.ready();const previous=f.state.daily!.id;
  for(const item of f.state.daily!.items)f.state.daily!.responses[String(item.id)]={action:'know',library_id:null,added:false};
  const a=await browser.newPage({baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3000'}),b=await browser.newPage({baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3000'});
  try{await mockDiscover(a,f);await mockDiscover(b,f);await a.goto('/discover');await a.getByRole('button',{name:'Discover 10 more'}).click();await expect(a.getByRole('heading',{name:'Your next 10.'})).toBeVisible();const current=f.state.daily!.id;expect(current).not.toBe(previous);await b.goto('/discover');await expect(b.getByRole('heading',{name:f.state.daily!.items[0].word,exact:true})).toBeVisible();expect(f.state.daily!.id).toBe(current);expect(f.history.size).toBe(2);}finally{await a.close();await b.close();}
 });
 test('an unupgraded database preserves the old batch and explains the required update',async({page})=>{
  const f=discoverFixture();f.ready();f.state.discover_version=1;for(const item of f.state.daily!.items)f.state.daily!.responses[String(item.id)]={action:'know',library_id:null,added:false};await mockDiscover(page,f);await page.goto('/discover');await expect(page.getByText(/one-time database update/)).toBeVisible();await expect(page.getByRole('button',{name:'Discover 10 more'})).toHaveCount(0);
 });

 test('a fully exhausted collection never offers a silent repeat',async({page})=>{
  const f=discoverFixture();f.ready();f.state.daily!.items=[];f.state.daily!.item_ids=[];f.state.daily!.remaining_count=0;await mockDiscover(page,f);await page.goto('/discover');await expect(page.getByRole('heading',{name:'No new words left.'})).toBeVisible();await expect(page.getByText(/no words will be repeated/)).toBeVisible();await expect(page.getByRole('button',{name:'Discover 10 more'})).toHaveCount(0);
 });

 test('an empty previous batch can offer new eligible words without claiming exhaustion',async({page})=>{
  const f=discoverFixture();f.ready();f.state.daily!.items=[];f.state.daily!.item_ids=[];f.state.daily!.remaining_count=3;await mockDiscover(page,f);await page.goto('/discover');await expect(page.getByRole('heading',{name:'More words are available.'})).toBeVisible();await expect(page.getByRole('button',{name:'Discover 10 more'})).toBeVisible();
 });

});
