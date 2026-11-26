import {expect,test,type Page} from '@playwright/test';
import {cloudOrigin,cloudUrl,mockCloud,sampleWord,user} from './helpers/cloud';

const en={id:'88888888-8888-4888-8888-888888888881',user_id:user.id,target_language:'en',explanation_language:'zh-CN',proficiency_level:'A2',display_order:0,preferences:{},created_at:'2026-01-01T00:00:00Z'};
const fr={...en,id:'88888888-8888-4888-8888-888888888882',target_language:'fr',display_order:1};
const es={...en,id:'88888888-8888-4888-8888-888888888883',target_language:'es',display_order:2};
const field=(page:Page)=>page.getByRole('combobox',{name:'Word or phrase'});
const shot=(page:Page,name:string)=>page.screenshot({path:'/tmp/noted-round04-after/'+name+'.png'});
async function ready(page:Page){
 const words=[{...sampleWord,collection_id:en.id},{...sampleWord,id:'44444444-4444-4444-8444-444444444444',word:'bonjour',due_at:'2000-01-01',meaning:'你好',collection_id:fr.id}];
 const writes:unknown[]=[];
 await mockCloud(page,route=>{
   const request=route.request(),url=new URL(request.url());
   if(request.method()==='HEAD'){
      const selected=url.searchParams.get('collection_id')?.slice(3);
      const total=selected?words.filter(word=>word.collection_id===selected).length:1;
      return route.fulfill({status:200,headers:{'Access-Control-Expose-Headers':'Content-Range','Content-Range':total?`0-0/${total}`:'*/0'}});
   }
   if(request.method()==='POST'){const row=request.postDataJSON();writes.push(row);return route.fulfill({json:row});}
   return route.fulfill({json:words});
 });
 await page.route(cloudOrigin+'/rest/v1/rpc/noted_collections_snapshot',route=>route.fulfill({json:{version:1,multilingual_enabled:true,learning_ready:true,collections:[en,fr,es]}}));
 await page.route(cloudOrigin+'/rest/v1/rpc/learning_collection_calendar',route=>route.fulfill({json:{tracking_since:'2020-01-01T00:00:00Z',days:[]}}));
 await page.route('**/api/ai-dictionary*',route=>route.fulfill({json:{available:false}}));
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:sampleWord.word,phonetics:[],chinese:['机缘巧合'],english:[],examples:[],synonyms:[]}}));
 await page.route('**/api/collection-reference?*',route=>route.fulfill({json:{sections:[{partOfSpeech:'Interjection',definitions:['hello']}],source:'https://en.wiktionary.org/wiki/bonjour'}}));
 return writes;
}
async function language(page:Page,name:string){
 await page.getByRole('button',{name:'Switch learning Collection'}).click();
 await page.getByRole('menuitemradio',{name,exact:true}).click();
}

for(const width of [320,375,390,430])test(`compact Add idle and active fit ${width}`,async({page})=>{
 test.skip(!cloudUrl);
 await page.setViewportSize({width,height:844});await ready(page);await page.goto('/add');
 const input=field(page);await expect(input).toBeVisible();
 const idle=(await input.boundingBox())!;
 expect(idle.height).toBeGreaterThanOrEqual(56);expect(idle.height).toBeLessThanOrEqual(60);expect(idle.y).toBeGreaterThan(170);
 if(width===390)await shot(page,'add-idle');
 await input.click();
 expect((await input.boundingBox())!.y).toBeLessThan(idle.y);
 await expect(input).toBeFocused();
 await input.fill('a phrase on a first line\nand a sentence on a second line');
 const multiline=(await input.boundingBox())!;
 expect(multiline.height).toBeGreaterThan(idle.height);
 const arrow=(await page.getByRole('button',{name:'Translate',exact:true}).boundingBox())!;
 expect(arrow.y).toBeGreaterThanOrEqual(multiline.y);
 expect(arrow.x+arrow.width).toBeLessThanOrEqual(multiline.x+multiline.width);
 const toolbar=(await page.getByRole('group',{name:'Input methods'}).boundingBox())!;
 expect(toolbar.y).toBeGreaterThanOrEqual(multiline.y+multiline.height);
 await expect(page.getByLabel('Input language',{exact:true})).toHaveCount(0);
 if(width===390)await shot(page,'add-multiline');
 await page.getByRole('button',{name:'Context',exact:true}).click();
 await page.getByRole('textbox',{name:'Translation context'}).fill('A sentence from a review.');
 if(width===390)await shot(page,'add-context');
 await page.getByRole('button',{name:'Context',exact:true}).click();
 await page.getByRole('button',{name:'Clear input'}).click();
 await expect(input).toHaveValue('');
 expect((await input.boundingBox())!.height).toBe(idle.height);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('clipboard acquisition keeps the original draft on denial, emptiness and cancelled replacement',async({page})=>{
 test.skip(!cloudUrl);const writes=await ready(page);
 await page.addInitScript(()=>{
   const data={value:'',deny:false,calls:0};
   Object.assign(window,{clipboardFixture:data});
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>{data.calls++;if(data.deny)throw new Error('Denied');return data.value;}}});
 });
 await page.goto('/add');
 const clip=(value:string,deny=false)=>page.evaluate(({value,deny})=>Object.assign((window as unknown as {clipboardFixture:{value:string;deny:boolean}}).clipboardFixture,{value,deny}),{value,deny});
 const paste=page.getByRole('button',{name:'Paste from clipboard'});
 await expect(field(page)).toHaveValue('');
 expect(await page.evaluate(()=>(window as unknown as {clipboardFixture:{calls:number}}).clipboardFixture.calls)).toBe(0);
 await paste.click();await expect(page.getByText('Clipboard is empty', {exact:false})).toBeVisible();
 await clip('A complete sentence.');await paste.click();
 await expect(field(page)).toHaveValue('A complete sentence.');
 await clip('你好');await paste.click();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(field(page)).toHaveValue('A complete sentence.');
 await paste.click();await page.getByRole('button',{name:'Replace Add text'}).click();
 await expect(field(page)).toHaveValue('你好');
 await clip('',true);await paste.click();
 await expect(page.getByText('Use the system Paste action', {exact:false})).toBeVisible();
 await expect(field(page)).toHaveValue('你好');
 expect(writes).toHaveLength(0);
});

test('Home uses scoped counts, and Profile shares collection state with Calendar',async({page})=>{
 test.skip(!cloudUrl);await page.setViewportSize({width:390,height:844});await ready(page);
 await page.goto('/');
 await expect(page.getByText('1 word due',{exact:true})).toBeVisible();await shot(page,'home');
 await language(page,'Spanish');
 await expect(page.getByText('Add your first word to start reviewing.')).toBeVisible();
 await language(page,'French');
 await page.getByRole('link',{name:'Start reviewing'}).click();
 await expect(page).toHaveURL(/\/review$/);
 await expect(page.getByRole('heading',{name:'bonjour',exact:true})).toBeVisible();
 await page.goto('/auth');await page.reload();
 const languages=page.getByRole('region',{name:'My Languages'});
 await expect(languages.getByRole('button',{name:'Settings for English'})).toContainText('A2');
 await expect(languages.getByRole('button',{name:'Settings for French'})).toContainText('Active');
 await expect(languages.getByRole('button',{name:'Settings for Spanish'}).locator('.wb-language-mark')).toHaveCSS('background-color','rgb(246, 194, 165)');
 await shot(page,'profile');
 await page.getByRole('button',{name:'Calendar language'}).click();
 await page.getByRole('menuitemradio',{name:'French',exact:true}).click();
 await expect(page.getByRole('button',{name:'Calendar language'})).toContainText('French');
 const calendar=page.locator('.learning-calendar');
 await expect(calendar.getByText('Unique words reviewed per day')).toBeVisible();
 await calendar.screenshot({path:'/tmp/noted-round04-after/calendar.png'});
});

test('Dictionary returns focus to its trigger and keeps the revealed Review card after an external tab',async({page,context})=>{
 test.skip(!cloudUrl);await page.setViewportSize({width:390,height:844});const writes=await ready(page);
 await context.route('https://en.wiktionary.org/**',route=>route.fulfill({body:'Dictionary fixture'}));
 await page.goto('/review');await language(page,'French');
 await expect(page.getByRole('heading',{name:'bonjour',exact:true})).toBeVisible();
 await shot(page,'review-hidden');
 await page.getByRole('button',{name:'Reveal answer'}).click();
 const trigger=page.getByRole('button',{name:'Dictionary for bonjour'});
 await expect(trigger).toBeVisible();await shot(page,'review-revealed');
 await page.locator('#app-content').focus();
 await trigger.dispatchEvent('click');
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('hello',{exact:true})).toBeVisible();
 const popupPromise=page.waitForEvent('popup');
 await dialog.getByRole('link',{name:'Wiktionary contributors'}).click();
 await (await popupPromise).close();
 await dialog.getByRole('button',{name:'Close',exact:true}).click();
 await expect(trigger).toBeFocused();
 await expect(page.getByRole('heading',{name:'bonjour',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Sure',exact:true})).toBeVisible();
 await expect(page.getByRole('group',{name:'Review mode'}).getByRole('button',{name:'Due words'})).toHaveAttribute('aria-pressed','true');
 expect(writes).toHaveLength(0);
 await shot(page,'review-dictionary-return');
});

test('speech input is editable and uses the normal translation route; cancel aborts listening',async({page})=>{
 test.skip(!cloudUrl);await page.setViewportSize({width:390,height:844});const writes=await ready(page);
 await page.addInitScript(()=>{
   const log:string[]=[];Object.assign(window,{voiceFixture:log,SpeechRecognition:class{
     lang='';onstart?:()=>void;onend?:()=>void;onresult?:(event:{results:{transcript:string}[][]})=>void;
     start(){log.push(this.lang);this.onstart?.();}
     stop(){this.onresult?.({results:[[{transcript:'你好'}]]});this.onend?.();}
     abort(){log.push('aborted');}
   }});
 });
 await page.route('**/api/collection-lookup',route=>{
   expect(route.request().postDataJSON()).toMatchObject({query:'你好',target:'fr',explanation:'zh-CN',source:'auto'});
   return route.fulfill({json:{items:[{english:'bonjour',meaning:'你好',usage:'',example:'',exampleTranslation:'',source:'translation'}]}});
 });
 await page.goto('/add');await language(page,'French');await page.getByRole('button',{name:'Voice input'}).click();
 await page.getByRole('button',{name:'Start listening'}).click();
 await expect(page.getByText('Listening…',{exact:true})).toBeVisible();
 await shot(page,'voice-input');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(await page.evaluate(()=>(window as unknown as {voiceFixture:string[]}).voiceFixture)).toContain('aborted');
 await page.getByRole('button',{name:'Voice input'}).click();
 await page.getByRole('button',{name:'Start listening'}).click();
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Recognised speech'})).toHaveValue('你好');
 await page.getByRole('button',{name:'Use text'}).click();
 await expect(field(page)).toHaveValue('你好');
 await page.getByRole('button',{name:'Translate',exact:true}).click();
 await expect(page.getByRole('heading',{name:'bonjour',exact:true})).toBeVisible();
 expect(writes).toHaveLength(0);
 await shot(page,'add-result');
});

test('photo decoding rejects unsupported files and cancellation keeps the draft',async({page})=>{
 test.skip(!cloudUrl);await ready(page);await page.goto('/add');
 await field(page).fill('my existing drafts');
 await page.getByRole('button',{name:'Scan text from photo'}).click();
 await page.getByLabel('Choose an image').setInputFiles({name:'sample.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
 await expect(page.getByRole('alert').filter({hasText:'supported image format'})).toBeVisible();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(field(page)).toHaveValue('my existing drafts');
});

test('the browser OCR worker extracts real text and selects only the desired passage',async({page})=>{
 const images=process.env.NOTED_OCR_FIXTURES;
 test.skip(!cloudUrl||!images);
 test.setTimeout(180000);
 await page.setViewportSize({width:390,height:844});
 const writes=await ready(page);
 await page.goto('/add');
 for(const [image,expected] of [['english.png','garden'],['chinese.png','你好'],['spanish.png','Hola'],['mixed.png','Bonjour'],['menu.png','Soup'],['rotated.png','garden'],['blurred.png','garden']]){
  await page.getByRole('button',{name:'Scan text from photo'}).click();
  await page.getByLabel('Choose an image').setInputFiles(images+'/'+image);
  const sheet=page.getByRole('dialog',{name:'Scan text from photo'});
  await expect(sheet.getByAltText('Selected photo preview')).toBeVisible();
  if(image==='english.png')await shot(page,'photo-preview');
  if(image==='rotated.png')for(let j=0;j<3;j++)await sheet.getByRole('button',{name:'Rotate photo'}).click();
  await sheet.getByRole('button',{name:'Recognise text'}).click();
  const recognised=sheet.getByRole('textbox',{name:'Recognised text'});
  await expect(recognised).toHaveValue(new RegExp(expected,'i'),{timeout:50000});
  if(image==='english.png'){
   await shot(page,'photo-recognised');
   await recognised.evaluate((el,word)=>{const input=el as HTMLTextAreaElement;const start=input.value.toLowerCase().indexOf(word);input.focus();input.setSelectionRange(start,start+word.length);input.dispatchEvent(new Event('select',{bubbles:true}));},expected);
   await sheet.getByRole('button',{name:'Use text'}).click();
   await expect(field(page)).toHaveValue(expected);
  }else await sheet.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 expect(writes).toHaveLength(0);
});
