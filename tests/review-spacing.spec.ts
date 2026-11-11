import {test,expect} from '@playwright/test';
import {cloudUrl,mockCloud,sampleWord} from './helpers/cloud';
test.describe('Review uses natural content height',()=>{
 test.skip(!cloudUrl,'Uses isolated account fixtures');
 for(const width of [320,390,768,1440])for(const mode of ['due','random'])test(`${mode} coherent hidden and revealed cards at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{Math.random=()=>0.5;Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],speak:()=>{},cancel:()=>{},addEventListener:()=>{},removeEventListener:()=>{}}});Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class{text:string;constructor(text:string){this.text=text}}});});
  const word=width===320?'take something in your stride':'extraordinarily';
  await mockCloud(page,route=>route.fulfill({json:[{...sampleWord,word,meaning:'从容应对；非同寻常地',example:'She learned to take it in her stride.'}]}));
  await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word,phonetics:[],chinese:[],english:[],examples:[],synonyms:[]}}));
  await page.goto(mode==='random'?'/review?mode=random':'/review');
  const card=page.locator('.review-card.wb-card'),reveal=page.getByRole('button',{name:'Reveal answer',exact:true});await expect(reveal).toBeVisible();
  // Measure steady-state spacing in CSS pixels, without entrance transforms.
  const metrics=await card.evaluate(element=>{
   const heading=element.querySelector('h2')!.getBoundingClientRect(),audio=element.querySelector('.random-pronunciation')!.getBoundingClientRect(),button=element.querySelector('.review-reveal')!.getBoundingClientRect(),style=getComputedStyle(element);
   return {wordToAudio:Math.round(audio.top-heading.bottom),audioToReveal:Math.round(button.top-audio.bottom),height:element.getBoundingClientRect().height,minHeight:style.minHeight,font:parseFloat(getComputedStyle(element.querySelector('h2')!).fontSize),padding:parseFloat(style.paddingBottom),topPadding:parseFloat(style.paddingTop),visibleHeight:heading.height+audio.height+button.height};
  });
  expect(metrics.minHeight).toBe('0px');expect(metrics.wordToAudio).toBeGreaterThanOrEqual(16);expect(metrics.wordToAudio).toBeLessThanOrEqual(24);expect(metrics.audioToReveal).toBeGreaterThanOrEqual(32);expect(metrics.audioToReveal).toBeLessThanOrEqual(48);expect(metrics.padding).toBeGreaterThanOrEqual(24);expect(metrics.padding).toBeLessThanOrEqual(32);expect(metrics.font).toBeGreaterThanOrEqual(40);expect(metrics.topPadding).toBe(metrics.padding+(mode==='random'?32:0));
  expect(metrics.height-metrics.visibleHeight-metrics.padding-metrics.topPadding).toBeLessThanOrEqual(72);
  if(mode==='random')await expect(card).toHaveCSS('background-color','rgb(255, 138, 91)');
  await card.screenshot({path:`/tmp/noted-review-hidden-${mode}-${width}.png`});
  await reveal.click();await expect(card.locator('.wb-meaning-reveal')).toHaveCSS('opacity','1');await expect(card.getByRole('button',{name:'Sure',exact:true})).toBeVisible();expect((await card.boundingBox())!.height).toBeGreaterThan(metrics.height);
  expect(await card.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await card.screenshot({path:`/tmp/noted-review-revealed-${mode}-${width}.png`});
  await card.getByRole('button',{name:mode==='due'?'Not sure':'Sure',exact:true}).click();
  await expect(card).toHaveCount(0);
 });
});
