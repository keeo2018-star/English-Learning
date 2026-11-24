import {test,expect,type Page} from '@playwright/test';
import {mockCloud,cloudUrl,sampleWord} from './helpers/cloud';
const before=process.env.NOTED_CAPTURE_BEFORE==='1';
const words=['securities','ammunition','ratings','sec','assess','evaluate','reflect on','take a step back','review the situation','consider','reassess'];
const cn:Record<string,string>={stocks:'股票，证券',securities:'证券，股票',ammunition:'弹药、军需资源',ratings:'评级，额定功率',sec:'秒',assess:'评估：全面检查并评价当前情况。',evaluate:'评估，评价', 'reflect on':'反思，回顾与评估','take a step back':'退一步评估整体情况','review the situation':'重新评估形势',consider:'评估、考虑',reassess:'重新评估'};
async function setup(page:Page){
 let rows=[{...sampleWord,word:'take stock of',meaning:'全面盘点，整体评估：对情况或资源进行检查。'}];const writes:Record<string,unknown>[]=[];
 await mockCloud(page,async route=>{const req=route.request();if(req.method()==='POST'){const value=req.postDataJSON();writes.push(value);rows=[...rows,{...sampleWord,...value,id:crypto.randomUUID()}];return route.fulfill({json:rows.at(-1)})}return route.fulfill({json:rows})});
 await page.route('**/api/related-words?*',route=>route.fulfill({json:{items:words.map(word=>({word,relation:'related'})),family:[],source:'Datamuse'}}));
 await page.route('**/api/dictionary?*',route=>{const word=new URL(route.request().url()).searchParams.get('word')||'';return route.fulfill({json:{word,phonetics:[],chinese:[cn[word]||'全面盘点，整体评估'],english:[],examples:[{source:'We should take stock of the situation.',translation:'我们应全面评估当前形势。'}],synonyms:word==='take stock of'?['stocks','securities']:[]}})});
 return {writes};
}
for(const width of [320,375,390,430,768,1440])test(`compact Quick Add at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});await setup(page);await page.goto('/add');const english=page.getByRole('combobox',{name:'Word or phrase'}),meaning=page.getByLabel('Meaning',{exact:true});
 await expect(english).toBeVisible();await page.screenshot({path:`/tmp/noted-quick-${before?'before':'after'}-${width}.png`,fullPage:true});
 if(before)return;
 const bounds=await english.boundingBox();expect(bounds!.height).toBeLessThan(90);
 await expect(meaning).toHaveCSS('background-color','rgba(0, 0, 0, 0)');expect((await meaning.boundingBox())!.height).toBeLessThanOrEqual(56);
 await expect(page.getByText('Your meaning stays editable.')).toHaveCount(0);
 await english.fill('I wouldn’t put it that way, even if you asked me directly.');await meaning.fill('这不是我会采用的说法。'.repeat(16));
 expect((await meaning.boundingBox())!.height).toBeLessThanOrEqual(202);await expect(meaning).toHaveValue('这不是我会采用的说法。'.repeat(16));
 await expect(page.getByLabel('Content type')).toHaveValue('auto');await expect(page.getByLabel('Content type').locator('option:checked')).toHaveText('Expression · Auto');
 await page.getByLabel('Content type').selectOption('word');await expect(page.getByLabel('Content type')).toHaveValue('word');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('complete expression recommendations exclude component-word senses and append without replacing saved controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});const state=await setup(page);await page.goto('/library');await page.getByRole('button',{name:'Dictionary for take stock of'}).click();const region=page.getByRole('region',{name:'Related Words'});await region.scrollIntoViewIfNeeded();
 if(before){await expect(region.getByRole('button',{name:'Save securities',exact:true})).toBeVisible();await page.screenshot({path:'/tmp/noted-related-semantic-before.png',fullPage:true});return;}
 await expect(region.getByRole('button',{name:'Save assess',exact:true})).toBeVisible();
 for(const word of ['securities','ammunition','ratings','sec','stocks'])await expect(region.getByRole('button',{name:`Save ${word}`,exact:true})).toHaveCount(0);
 await expect(region.getByRole('button',{name:/^Save /})).toHaveCount(6);
 await region.getByRole('button',{name:'Save assess',exact:true}).click();await expect(region.getByRole('button',{name:'Saved assess',exact:true})).toBeDisabled();expect(state.writes[0].meaning).toBe(cn.assess);
 const first=region.getByRole('button',{name:'Saved assess',exact:true});await region.getByRole('button',{name:'Explore more',exact:true}).click();await expect(first).toBeVisible();
 await expect(region.getByRole('button',{name:'Save reassess',exact:true})).toBeVisible();await expect(region.getByRole('button',{name:'Explore more',exact:true})).toHaveCount(0);
 expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'/tmp/noted-related-semantic-after.png'});
});
test('video remains lazy and inside its stacking context below the sticky close action',async({page})=>{
 test.skip(before);await setup(page);
 await page.addInitScript(()=>{Object.defineProperty(window,'YG',{value:{Widget:class{
  constructor(host:HTMLElement,options:{events:{onFetchDone:(e:unknown)=>void;onPlayerReady:(e:unknown)=>void}}){const frame=document.createElement('iframe');frame.title='Fixture video';frame.style.cssText='position:relative;z-index:2147483647;width:100%;height:360px';host.append(frame);queueMicrotask(()=>{options.events.onFetchDone({totalResult:1});options.events.onPlayerReady({});});}
  fetch(){}pause(){}replay(){}next(){}close(){}removeEventListener(){}
 }}});});
 await page.setViewportSize({width:390,height:844});await page.goto('/library');await page.getByRole('button',{name:'Dictionary for take stock of'}).click();const sheet=page.getByRole('dialog');await expect(sheet.locator('iframe')).toHaveCount(0);
 await sheet.getByRole('button',{name:'Watch in context',exact:true}).click();await expect(sheet.locator('iframe')).toHaveCount(0);await sheet.getByRole('button',{name:'Agree & load video'}).click();const frame=sheet.locator('iframe');await expect(frame).toHaveCount(1);
 await sheet.evaluate(el=>{const frame=el.querySelector('iframe')!;el.scrollTop+=frame.getBoundingClientRect().top-el.getBoundingClientRect().top-20;});
 const close=sheet.getByRole('button',{name:'Close',exact:true});await expect(close).toBeInViewport();expect(await close.evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===el})).toBe(true);
 expect(await close.evaluate(el=>{const header=el.parentElement!,sheet=header.closest('dialog')!,r=sheet.getBoundingClientRect();return header.contains(document.elementFromPoint(r.x+30,r.y+8));})).toBe(true);
 await sheet.getByRole('button',{name:'Hide video',exact:true}).click();await expect(frame).toHaveCount(0);
});
test.skip(!cloudUrl,'Isolated account fixtures');

test('optional suggestion pending/failure never delays saving a manual meaning',async({page})=>{
 test.skip(before);const state=await setup(page);let release=()=>{};const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/smart-add/meaning',async route=>{await gate;await route.fulfill({status:503,json:{meaning:'',source:null}});});
 await page.goto('/add');await page.getByRole('combobox',{name:'Word or phrase'}).fill('assess');await page.getByLabel('Meaning',{exact:true}).fill('我的评估解释');await page.getByRole('button',{name:'Suggest meaning',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'AI isn’t configured'})).toBeVisible();
 await page.getByRole('button',{name:'Add to my library +',exact:true}).click();await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();expect(state.writes[0].meaning).toBe('我的评估解释');release();
});

test('dictionary outages stop bounded validation without blocking the existing Reference',async({page})=>{
 test.skip(before);await setup(page);let calls=0;
 await page.route('**/api/dictionary?*',route=>{if(new URL(route.request().url()).searchParams.get('word')==='take stock of')return route.fallback();calls++;return route.fulfill({status:503,json:{message:'Unavailable'}})});
 await page.goto('/library');await page.getByRole('button',{name:'Dictionary for take stock of'}).click();const region=page.getByRole('region',{name:'Related Words'});await region.scrollIntoViewIfNeeded();await expect(region).toHaveCount(0);expect(calls).toBeLessThanOrEqual(3);
 await expect(page.getByRole('dialog').getByRole('button',{name:'Close',exact:true})).toBeEnabled();
});

test('an empty personal meaning uses the dictionary sense for recommendations without filling My meaning',async({page})=>{
 test.skip(before);await setup(page);await page.route('**/rest/v1/words?*',route=>route.fulfill({json:[{...sampleWord,word:'take stock of',meaning:''}]}));
 await page.goto('/library');await page.getByRole('button',{name:'Dictionary for take stock of'}).click();const region=page.getByRole('region',{name:'Related Words'});await region.scrollIntoViewIfNeeded();await expect(region.getByRole('button',{name:'Save assess',exact:true})).toBeVisible();await expect(region.getByRole('button',{name:'Save securities',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Edit my meaning',exact:true}).click();await expect(page.getByLabel('My meaning',{exact:true})).toHaveValue('');
});
