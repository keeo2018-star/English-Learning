import {test,expect,type Page,type Locator} from '@playwright/test';
import {mockCloud,cloudUrl,sampleWord} from './helpers/cloud';
async function setup(page:Page){
 const state={rows:[{...sampleWord,meaning:'机缘巧合',example:'原有语境',item_type:'word'}],posts:[] as Record<string,unknown>[],patches:[] as Record<string,unknown>[],emptyFails:false};
 await mockCloud(page,async route=>{const req=route.request(),body=req.method()==='GET'?null:req.postDataJSON();
  if(req.method()==='PATCH'){state.patches.push(body);state.rows[0]={...state.rows[0],...body};return route.fulfill({json:state.rows[0]})}
  if(req.method()==='POST'){state.posts.push(body);if(state.emptyFails&&!body.meaning)return route.fulfill({status:400,json:{code:'23514',message:'meaning must not be empty'}});const row={...sampleWord,...body,id:body.id||crypto.randomUUID()};state.rows.push(row);return route.fulfill({json:row})}
  return route.fulfill({json:state.rows});
 });
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:new URL(route.request().url()).searchParams.get('word')||sampleWord.word,phonetics:[],chinese:[],english:[],examples:[],synonyms:[]}}));
 return state;
}
async function start(field:Locator,value:string,updateOnly=false){
 await field.focus();if(!updateOnly)await field.dispatchEvent('compositionstart',{data:''});
 await field.evaluate((node,value)=>{const el=node as HTMLInputElement|HTMLTextAreaElement,proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.setSelectionRange(value.length,value.length);el.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:value}));el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:value}));},value);
}
async function end(field:Locator,value:string,lateInput=false){
 await field.evaluate((node,{value,lateInput})=>{const el=node as HTMLInputElement|HTMLTextAreaElement,proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const set=(value:string)=>Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);
  if(!lateInput)set(value);el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:value}));if(lateInput)set(value);el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:false,inputType:'insertText',data:value}));
 },{value,lateInput});await field.page().waitForTimeout(100);
}
async function stable(field:Locator){await field.evaluate(node=>{const el=node as HTMLTextAreaElement;const descriptor=Object.getOwnPropertyDescriptor(el,'value')||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!;Object.assign(window,{imeNode:el,imeRewrites:0});Object.defineProperty(el,'value',{configurable:true,get:()=>descriptor.get!.call(el),set:value=>{(window as unknown as {imeRewrites:number}).imeRewrites++;descriptor.set!.call(el,value)}});});}
async function assertStable(field:Locator,value:string){await expect(field).toHaveValue(value);await expect(field).toBeFocused();expect(await field.evaluate(el=>el===(window as unknown as {imeNode:Element}).imeNode)).toBe(true);expect(await field.page().evaluate(()=>(window as unknown as {imeRewrites:number}).imeRewrites)).toBe(0);}
async function submitWhileComposing(field:Locator){
 const allowed=await field.evaluate(node=>{const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true,bubbles:true,cancelable:true});return node.dispatchEvent(event)});expect(allowed).toBe(true);
 await field.evaluate(node=>(node as HTMLInputElement).form!.requestSubmit());
}
async function dictionary(page:Page){await page.goto('/library');await page.getByRole('button',{name:`Dictionary for ${sampleWord.word}`,exact:true}).click();await page.getByRole('button',{name:'Edit my meaning',exact:true}).click();return page.getByRole('textbox',{name:'My meaning',exact:true});}
test.describe('Chinese native IME compatibility',()=>{test.skip(!cloudUrl,'Isolated authenticated fixtures');
 test('Dictionary preedit survives a late reference response with no value rewrites, remount or accidental save',async({page})=>{
  await page.setViewportSize({width:390,height:844});const state=await setup(page);let release=()=>{};const gate=new Promise<void>(r=>release=r);await page.route('**/api/dictionary?*',async route=>{await gate;await route.fulfill({json:{word:sampleWord.word,phonetics:[],chinese:['参考释义'],english:[],examples:[],synonyms:[]}})});
  const field=await dictionary(page);await stable(field);await start(field,'wo de shi yi');const caret=await field.evaluate(el=>(el as HTMLTextAreaElement).selectionStart);await submitWhileComposing(field);release();await expect(page.getByText('参考释义',{exact:true})).toBeVisible();await assertStable(field,'wo de shi yi');expect(await field.evaluate(el=>(el as HTMLTextAreaElement).selectionStart)).toBe(caret);expect(state.patches).toHaveLength(0);
  await end(field,'我的释义');await expect(field).toHaveValue('我的释义');await page.getByRole('button',{name:'Save meaning',exact:true}).click();expect(state.patches).toHaveLength(1);expect(state.patches[0]).toEqual({meaning:'我的释义'});await expect(page.getByRole('dialog').getByText('我的释义',{exact:true})).toBeVisible();
 });
 test('Add meaning owns its Pinyin draft during slow auto-fill and saves only converted Chinese',async({page})=>{
  const state=await setup(page);await page.goto('/add');let release=()=>{};const gate=new Promise<void>(r=>release=r);await page.route('**/api/smart-add/meaning',async route=>{await gate;await route.fulfill({json:{meaning:'不应该覆盖',source:'dictionary'}})});
  await page.getByLabel('Word or phrase').fill('subtle');await expect(page.getByText('Finding meaning…')).toBeVisible();const field=page.getByLabel('Meaning',{exact:true});await stable(field);await start(field,'xin de shi yi');release();await page.waitForTimeout(150);await submitWhileComposing(field);await assertStable(field,'xin de shi yi');expect(state.posts).toHaveLength(0);await end(field,'新的释义');await field.press('End');await field.pressSequentially(' / English');await page.getByRole('button',{name:'Add to my library +',exact:true}).click();await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();expect(state.posts[0].meaning).toBe('新的释义 / English');
 });
 test('English editor hides suggestions during composition, preserves candidate keys and keeps Expression newlines',async({page})=>{
  const state=await setup(page);await page.goto('/add');await page.route('**/api/smart-add/suggestions?*',route=>route.fulfill({json:{suggestions:[{word:'subtle'}]}}));const field=page.getByLabel('Word or phrase');await field.fill('subt');await expect(page.getByRole('listbox')).toBeVisible();await field.press('ArrowDown');await stable(field);await start(field,'xue xi');await expect(page.getByRole('listbox')).toHaveCount(0);await submitWhileComposing(field);await assertStable(field,'xue xi');expect(state.posts).toHaveLength(0);
  await field.evaluate(node=>{node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'学习'}));const key=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});if(node.dispatchEvent(key))throw new Error('Trailing Safari Enter should not submit')});await end(field,'学习');await page.getByRole('button',{name:'Clear English text'}).click();await field.fill('take it easy');await field.press('Enter');await expect(field).toHaveValue('take it easy\n');expect(state.posts).toHaveLength(0);await page.getByLabel('Meaning',{exact:true}).fill('放轻松');await field.press('Control+Enter');await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();
 });
 test('Personal Context retains preedit and commits the complete original sentence',async({page})=>{
  const state=await setup(page);await page.goto('/add');await page.getByLabel('Word or phrase').fill('keep it natural');await page.getByLabel('Meaning',{exact:true}).fill('保持自然');await page.locator('summary').filter({hasText:'My Context'}).click();const field=page.getByLabel('My Context',{exact:true});await stable(field);await start(field,'zhe shi wo de yu jing');await submitWhileComposing(field);await assertStable(field,'zhe shi wo de yu jing');expect(state.posts).toHaveLength(0);await end(field,'这是我的语境。\nKeep it natural.');await page.getByRole('button',{name:'Add to my library +',exact:true}).click();await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();expect(state.posts[0].example).toBe('这是我的语境。\nKeep it natural.');
 });
 test('Library word, meaning and example preserve native composition and save only on explicit confirmation',async({page})=>{
  const state=await setup(page);await page.goto('/library');await page.getByRole('button',{name:`Edit ${sampleWord.word}`,exact:true}).click();const form=page.getByRole('form',{name:`Edit ${sampleWord.word}`});
  for(const [label,pinyin,chinese] of [['Word or phrase','zi ran biao da','自然表达'],['Meaning','xin de jie shi','新的解释'],['Example sentence','yuan you yu jing','原有语境，新的细节。']]){const field=form.getByRole('textbox',{name:label,exact:true});await start(field,pinyin);await submitWhileComposing(field);expect(state.patches).toHaveLength(0);await expect(field).toBeFocused();await end(field,chinese);await expect(field).toHaveValue(chinese)}
  await form.getByLabel('Word or phrase',{exact:true}).fill('a natural expression');await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).toHaveCount(0);expect(state.patches[0]).toMatchObject({word:'a natural expression',meaning:'新的解释',example:'原有语境，新的细节。'});
 });
 test('Chinese Library search filters after composition and keeps English typing responsive',async({page})=>{
  await setup(page);await page.goto('/library');const field=page.getByLabel('Search library');await start(field,'ji yuan');await expect(page.getByRole('status',{name:'Library count'})).toHaveText('1 item');await end(field,'机缘');await expect(page.getByRole('status',{name:'Library count'})).toHaveText('1 result · 1 total items');await field.fill('missing');await expect(page.getByRole('status',{name:'Library count'})).toHaveText('0 results · 1 total items');await expect(field).toBeFocused();
 });
 test('compositionupdate fallback and a final Chinese input after compositionend retain the converted value',async({page})=>{
  const state=await setup(page);await page.goto('/add');await page.getByLabel('Word or phrase').fill('unmistakable');const field=page.getByLabel('Meaning',{exact:true});await stable(field);await start(field,'ming que',true);await submitWhileComposing(field);await assertStable(field,'ming que');await end(field,'明确',true);await page.getByRole('button',{name:'Add to my library +',exact:true}).click();await expect(page.getByText('Added to Library',{exact:true})).toBeVisible();expect(state.posts[0].meaning).toBe('明确');
 });
});
test.describe('Existing Chinese and related meanings',()=>{test.skip(!cloudUrl,'Isolated authenticated fixtures');
 test('editing inside existing Chinese preserves surrounding text and selection across Library refresh',async({page})=>{
  const state=await setup(page),field=await dictionary(page);await stable(field);await start(field,'机缘xin巧合');await field.evaluate(el=>(el as HTMLTextAreaElement).setSelectionRange(5,5));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(120);await assertStable(field,'机缘xin巧合');expect(await field.evaluate(el=>(el as HTMLTextAreaElement).selectionStart)).toBe(5);await end(field,'机缘新的巧合');await page.getByRole('button',{name:'Save meaning',exact:true}).click();await expect(page.getByRole('dialog').getByText('机缘新的巧合',{exact:true})).toBeVisible();expect(state.patches[0].meaning).toBe('机缘新的巧合');
 });
 test('related-word inline meaning guards candidate Enter and saves converted Chinese',async({page})=>{
  const state=await setup(page);state.emptyFails=true;await page.route('**/api/related-words?*',route=>route.fulfill({json:{items:[{word:'horoscope'}],family:[],source:'Datamuse'}}));await page.goto('/library');await page.getByRole('button',{name:`Dictionary for ${sampleWord.word}`,exact:true}).click();await page.getByRole('button',{name:'Save horoscope',exact:true}).click();const field=page.getByLabel('Meaning for related word');await expect(field).toBeVisible();await start(field,'xing zuo yun shi');await submitWhileComposing(field);expect(state.posts).toHaveLength(1);await end(field,'星座运势');await page.getByRole('button',{name:'Save with meaning',exact:true}).click();await expect(page.getByRole('button',{name:'Saved horoscope',exact:true})).toBeVisible();expect(state.posts).toHaveLength(2);expect(state.posts[1].meaning).toBe('星座运势');
 });
});
