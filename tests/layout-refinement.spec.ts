import {test,expect} from '@playwright/test';
import {cloudUrl,mockCloud,sampleWord} from './helpers/cloud';
import {discoverFixture,mockDiscover} from './helpers/discover';

test.describe('Editorial pages and centered learning cards',()=>{
 test.skip(!cloudUrl,'Uses isolated authenticated fixtures');
 for(const width of [320,390,768,1440]) test(`shared spacing and readable content at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  const item={...sampleWord,word:'take something in your stride',meaning:'从容应对',example:'She learned to take something in your stride.'};
  await mockCloud(page,route=>route.fulfill({json:[item]}));
  await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:item.word,phonetics:[{accent:'UK',text:'straɪd'},{accent:'US',text:'straɪd'}],chinese:['从容应对'],english:[{partOfSpeech:'expression',definition:'Deal calmly with a difficult situation.'}],examples:[{source:item.example,translation:'她学会了从容应对。'}],synonyms:[]}}));
  await page.goto('/add');
  const input=page.getByRole('combobox',{name:'Word or phrase'}),meaning=page.getByRole('textbox',{name:'Meaning',exact:true});
  await expect(input).toBeVisible();expect(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(36);
  const inputBox=(await input.boundingBox())!,meaningBox=(await meaning.boundingBox())!;
  expect(inputBox.height).toBeGreaterThanOrEqual(76);expect(inputBox.height).toBeLessThanOrEqual(100);
  expect(meaningBox.height).toBeGreaterThanOrEqual(96);expect(meaningBox.height).toBeLessThanOrEqual(112);
  const assist=(await page.getByRole('button',{name:'Suggest meaning'}).boundingBox())!;expect(assist.y+assist.height).toBeLessThanOrEqual(meaningBox.y);
  const framePadding=await page.locator('.wb-app-frame').evaluate(el=>getComputedStyle(el).paddingLeft);
  expect(framePadding).toBe(width<700?'20px':width<1100?'40px':'64px');
  await page.screenshot({path:`/tmp/noted-layout-add-${width}.png`,fullPage:true});
  for(const route of ['/review','/review?mode=random']){
   await page.goto(route);const card=page.locator('.review-card.wb-card');await expect(card).toBeVisible();
   await expect(card).toHaveCSS('text-align','center');expect(await card.locator('h2').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(40);
   expect((await card.boundingBox())!.width).toBeLessThanOrEqual(760);
   await page.getByRole('button',{name:'Reveal answer'}).click();
   const ratings=page.getByRole('group',{name:'How well did you recall it?'});await expect(ratings).toBeVisible();await expect(card.locator('.wb-meaning-reveal')).toHaveCSS('opacity','1');
   await page.screenshot({path:`/tmp/noted-layout-${route.includes('?')?'random':'due'}-${width}.png`,fullPage:true});
  }
  await page.getByRole('button',{name:`Dictionary for ${item.word}`,exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog).toHaveCSS('text-align','left');
  const english=dialog.getByRole('heading',{name:'English',exact:true}),video=dialog.getByRole('heading',{name:'In the Wild'});
  expect((await english.boundingBox())!.y).toBeLessThan((await video.boundingBox())!.y);
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  const audio=dialog.getByRole('button',{name:'Play pronunciation'});await expect(audio).toHaveCount(2);
  for(const control of await audio.all())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({path:`/tmp/noted-layout-dictionary-${width}.png`});
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  const f=discoverFixture();f.ready();f.state.daily!.items=f.state.daily!.items.map((word,i)=>i===0?{...word,word:'extraordinarily',meaning:'异乎寻常地',pos:'r',example:'The view was extraordinarily beautiful.'}:word);await mockDiscover(page,f);
  await page.goto('/discover');const discover=page.locator('.wb-learning-card');await expect(discover).toHaveCSS('text-align','center');
  await page.getByRole('button',{name:'Reveal meaning'}).click();await expect(discover.locator('blockquote')).toHaveCSS('border-left-width','0px');
  await page.screenshot({path:`/tmp/noted-layout-discover-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Save to Library'}).scrollIntoViewIfNeeded();await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  const save=(await page.getByRole('button',{name:'Save to Library'}).boundingBox())!,nav=(await page.getByRole('navigation',{name:'Main navigation'}).boundingBox())!;
  expect(save.y+save.height).toBeLessThanOrEqual(nav.y);
 });
});
