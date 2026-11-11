import {test,expect,type Page} from '@playwright/test';
import {mockCloud,cloudUrl,cloudOrigin,sampleWord,user} from './helpers/cloud';
import {newReviewSession,reviewSessionKey} from '../src/lib/review-session';
async function setup(page:Page,count=3){
 const state={items:Array.from({length:count},(_,i)=>({...sampleWord,id:`22222222-2222-4222-8222-${String(i).padStart(12,'0')}`,word:i===0?'caught off guard':`vocabulary${i}`,example:'',item_type:i===0?'expression':'word'})),deletes:[] as string[],ratings:0,fail:false};
 const session=newReviewSession(user.id,state.items.map(item=>({id:item.id,direction:'forward'})));
 await page.addInitScript(({key,session})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(session))},{key:reviewSessionKey(user.id),session});
 await mockCloud(page,async route=>{const id=new URL(route.request().url()).searchParams.get('id')?.replace('eq.','');
  if(route.request().method()==='DELETE'){state.deletes.push(id!);if(state.fail)return route.fulfill({status:503,json:{message:'Could not delete. Try again.'}});state.items=state.items.filter(item=>item.id!==id);return route.fulfill({json:{id}})}
  return route.fulfill({json:state.items});
 });
 await page.route(cloudOrigin+'/rest/v1/rpc/record_learning_review',route=>{state.ratings++;return route.fulfill({status:500,json:{message:'Deletion must not rate'}})});
 return state;
}
test.describe('Integrated Add title and Random Review deletion',()=>{
 test.skip(!cloudUrl,'Uses isolated authenticated fixtures');
 for(const width of [320,390,1440])test(`editable title, divider, clear and multiline at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:844});await setup(page);await page.goto('/add');const input=page.getByRole('combobox',{name:'Word or phrase'});
  await expect(input).toHaveAttribute('placeholder','Type a word or phrase…');await expect(page.getByRole('button',{name:'Clear English text'})).toHaveCount(0);
  const style=await input.evaluate(el=>{const c=getComputedStyle(el);return {background:c.backgroundColor,radius:c.borderRadius,border:c.borderTopWidth,divider:c.borderBottomColor,outline:c.outlineStyle}});
  expect(style).toMatchObject({background:'rgba(0, 0, 0, 0)',radius:'0px',border:'0px',outline:'none'});await input.screenshot({path:`/tmp/noted-title-empty-${width}.png`});
  await input.fill('subtle');await input.focus();await expect(input).toHaveCSS('outline-style','none');expect(await input.evaluate(el=>getComputedStyle(el).borderBottomColor)).not.toBe(style.divider);
  expect(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(36);await input.screenshot({path:`/tmp/noted-title-word-${width}.png`});const short=(await input.boundingBox())!.height;
  await input.fill('I wouldn’t put it that way, even if you asked me directly.\nAnother natural expression to remember.');await page.waitForTimeout(450);expect((await input.boundingBox())!.height).toBeGreaterThan(short);
  expect(await input.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);const clear=page.getByRole('button',{name:'Clear English text'}),button=(await clear.boundingBox())!,bounds=(await input.boundingBox())!;expect(button.x).toBeGreaterThan(bounds.x+bounds.width-60);await input.screenshot({path:`/tmp/noted-title-expression-${width}.png`});
  await clear.click();await expect(input).toHaveValue('');await expect(input).toBeFocused();await expect(clear).toHaveCount(0);
 });
 test('keyboard-sized viewport keeps the editor visible and Save above the navigation/accessory region',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);await page.goto('/add');const input=page.getByLabel('Word or phrase');await input.fill('a natural expression');await page.getByLabel('Meaning',{exact:true}).fill('自然的表达');await input.focus();await page.setViewportSize({width:390,height:390});await page.waitForTimeout(450);
  const bounds=(await input.boundingBox())!;expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThan(390);
  const save=page.getByRole('button',{name:'Add to my library +',exact:true});await save.scrollIntoViewIfNeeded();const rect=(await save.boundingBox())!,nav=(await page.getByRole('navigation',{name:'Main navigation'}).boundingBox())!;expect(rect.y+rect.height).toBeLessThan(nav.y);expect(await save.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})).toBe(true);await page.screenshot({path:'/tmp/noted-add-keyboard-390.png'});
 });
 test('cancel preserves card and Library; success advances without rating and persists the queue',async({page})=>{
  const state=await setup(page);await page.goto('/review?mode=random');await page.getByRole('button',{name:'Delete entry',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('caught off guard');await expect(dialog).toContainText('removed from your library');await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(state.deletes).toHaveLength(0);await expect(page.locator('.review-card h2')).toHaveText('caught off guard');await expect(page.getByRole('button',{name:'Delete entry'})).toBeFocused();
  await page.getByRole('button',{name:'Delete entry'}).click();await dialog.getByRole('button',{name:'Delete',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.review-card h2')).toHaveText('vocabulary1');await expect(page.getByRole('button',{name:'Reveal answer',exact:true})).toBeFocused();await expect(page.getByRole('status',{name:'Session progress'})).toHaveText('0 / 2');expect(state.ratings).toBe(0);expect(state.items.some(item=>item.word==='caught off guard')).toBe(false);
  await page.reload();await expect(page.locator('.review-card h2')).toHaveText('vocabulary1');const queue=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).queue,reviewSessionKey(user.id));expect(queue).toHaveLength(2);
  await page.goto('/library');await expect(page.getByRole('button',{name:'Delete caught off guard',exact:true})).toHaveCount(0);await expect(page.getByRole('status',{name:'Library count'})).toHaveText('2 items');
 });
 test('deleting the last card shows completion and never creates a review response',async({page})=>{
  const state=await setup(page,1);await page.goto('/review?mode=random');await page.getByRole('button',{name:'Delete entry'}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByRole('heading',{name:'Review complete.'})).toBeVisible();await expect(page.getByText('0 items reviewed.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Start another review',exact:true})).toBeFocused();expect(state.items).toHaveLength(0);expect(state.ratings).toBe(0);await page.reload();await expect(page.getByRole('heading',{name:'Review complete.'})).toBeVisible();
 });
 test('failed deletion keeps the same entry and dialog available for retry',async({page})=>{
  const state=await setup(page);state.fail=true;await page.goto('/review?mode=random');await page.getByRole('button',{name:'Delete entry'}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Delete',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Could not delete');await expect(page.locator('.review-card h2')).toHaveText('caught off guard');expect(state.items).toHaveLength(3);expect(state.ratings).toBe(0);state.fail=false;await dialog.getByRole('button',{name:'Delete',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.review-card h2')).toHaveText('vocabulary1');expect(state.ratings).toBe(0);
 });
});
