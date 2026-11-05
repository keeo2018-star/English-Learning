import { chromium } from '@playwright/test';
import { mockCloud, sampleWord } from '../helpers/cloud.ts';
const letters=n=>{let value='';for(let i=0;i<4;i++){value=String.fromCharCode(97+n%26)+value;n=Math.floor(n/26)}return value};
const count=1000;
const entries=Array.from({length:count},(_,i)=>({...sampleWord,id:`22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,word:i===count-1?'needle':'vocab'+letters(i),meaning:`Meaning ${i}`,example:'A learning example.'}));
const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage();const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 let lookups=0;
 await mockCloud(page,route=>{const url=new URL(route.request().url());return route.fulfill({json:entries.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+1000)})});
 await page.route('**/api/dictionary?*',async route=>{lookups++;await new Promise(r=>setTimeout(r,150));await route.fulfill({status:404,json:{message:'No entry'}}).catch(()=>{})});
 const started=Date.now();await page.goto((process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000') + '/library');
 await page.getByRole('status',{name:'Library count'}).filter({hasText:'1000 items'}).waitFor({timeout:60000});
 await page.locator('.word-row').first().waitFor();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const before={rows:await page.locator('.word-row').count(),nodes:await page.locator('*').count(),metadataRequests:lookups,loadMs:Date.now()-started};
 await page.getByLabel('Search library').evaluate(input=>{window.inputPaints=[];input.addEventListener('input',()=>{const now=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>window.inputPaints.push(performance.now()-now)))})});
 const typing=Date.now();await page.getByLabel('Search library').pressSequentially('needle');
 await page.getByRole('heading',{name:'needle',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelectorAll('.word-row').length===1);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const paints=await page.evaluate(()=>window.inputPaints);
 const result={fixture:'1000 items, 390px, Chromium, 4x CPU slowdown, mocked dictionary 150ms',before,search:{wallMs:Date.now()-typing,paintSamplesMs:paints.map(v=>Math.round(v)),maxPaintMs:Math.round(Math.max(...paints)),requests:lookups,rows:await page.locator('.word-row').count()}};
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
