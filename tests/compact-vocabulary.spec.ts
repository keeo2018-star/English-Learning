import { expect, test } from '@playwright/test';
import { cloudUrl, mockCloud, sampleWord } from './helpers/cloud';

const evidence = process.env.NOTED_COMPACT_EVIDENCE;
const baseline = process.env.NOTED_COMPACT_BASELINE === '1';
const short = 'segment';
const long = 'I wouldn’t put it that way, even if you asked me directly.';
const phonetics = [
  {accent:'UK',text:'/ˈsɛɡ.mənt/'},
  {accent:'US',text:'/ˈsɛɡ.mənt/'},
];
test('compact Dictionary controls and shared vocabulary typography at 320px',async({page})=>{
  test.skip(!cloudUrl,'Requires a configured isolated fixture');
  await page.setViewportSize({width:320,height:844});
  await mockCloud(page, route=>route.fulfill({json:[{...sampleWord,word:short}]}));
  await page.route('**/api/dictionary?*',route=>route.fulfill({json:{
    word:short,phonetics,chinese:['段'],english:[{partOfSpeech:'n.',definition:'A part of a whole.'}],examples:[],synonyms:[],
  }}));
  await page.goto('/review');
  const reviewTitle=page.getByRole('heading',{name:short,exact:true});
  await expect(reviewTitle).toBeVisible();
  if(evidence)await page.screenshot({path:evidence+'/review.png'});
  const typography=(node:HTMLElement|SVGElement)=>{const s=getComputedStyle(node);return [s.fontFamily,s.fontWeight,s.fontSize,s.letterSpacing,s.lineHeight]};
  const reviewStyle=await reviewTitle.evaluate(typography);
  await page.goto('/library');
  await page.getByRole('button',{name:'Dictionary for '+short,exact:true}).click();
  const sheet=page.getByRole('dialog',{name:'Dictionary'});
  await expect(sheet.getByText('/ˈsɛɡ.mənt/',{exact:true})).toBeVisible();
  const buttons=sheet.locator('button[data-accent]');
  await expect(buttons).toHaveCount(2);
  if(!baseline){
    const sizes=await buttons.evaluateAll(nodes=>nodes.map(node=>{
      const rect=node.getBoundingClientRect(),surface=node.firstElementChild!,visible=surface.getBoundingClientRect();
      return {w:rect.width,h:rect.height,small:visible.height,border:getComputedStyle(surface).borderTopWidth,x:rect.x,right:rect.right,y:rect.y,bottom:rect.bottom};
    }));
    for(const size of sizes){expect(size.w).toBeGreaterThanOrEqual(44);expect(size.h).toBeGreaterThanOrEqual(44);expect(size.small).toBeGreaterThanOrEqual(28);expect(size.small).toBeLessThanOrEqual(32);expect(size.border).toBe('1px');}
    expect(sizes[0].right<=sizes[1].x||sizes[0].bottom<=sizes[1].y).toBe(true);
  }
  if(evidence)await page.screenshot({path:evidence+'/dictionary.png'});
  await page.goto('/add');
  const input=page.getByRole('combobox',{name:'Word or phrase'});
  const preview=page.getByRole('region',{name:'Vocabulary card preview'});
  for(const [word,name] of [['relish','add-short'],[long,'add-long']]){
    await input.fill(word);
    const heading=preview.getByRole('heading',{name:word,exact:true});
    await expect(heading).toBeVisible();
    if(!baseline&&name==='add-long')await expect(heading).toHaveAttribute('data-long','true');
    if(!baseline&&name==='add-short'){
      expect(await heading.evaluate(typography)).toEqual(reviewStyle);
      await expect(heading).toHaveCSS('text-align','start');
    }
    if(evidence)await preview.screenshot({path:evidence+'/'+name+'.png'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await preview.getByRole('button',{name:'Edit vocabulary'}).click();
  await preview.getByRole('textbox',{name:'Vocabulary expression'}).fill('a shorter expression');
  await expect(preview.getByRole('heading',{name:'a shorter expression'})).toBeVisible();
  if(!baseline){
    await preview.getByRole('textbox',{name:'Meaning',exact:true}).fill('我的释义');
    await page.getByRole('button',{name:'Clear input',exact:true}).click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await input.fill('another expression');
    await expect(preview.getByRole('textbox',{name:'Meaning',exact:true})).toHaveValue('我的释义');
    await input.fill(short);
    await expect(preview.getByText('Already in your Library')).toBeVisible();
    await expect(preview.getByRole('link',{name:'View existing item'})).toBeVisible();
    await expect(preview.getByRole('button',{name:/Add to my library/})).toHaveCount(0);
  }
});
