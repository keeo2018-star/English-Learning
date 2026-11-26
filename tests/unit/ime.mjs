import test from 'node:test';import assert from 'node:assert/strict';
import {imeState,imeKeyBlocked,imeBlocksSubmit,formIsComposing,trackExplicitImeSubmit} from '../../src/lib/ime.ts';
test('IME keys retain active composition and guard Safari commit-tail Enter without blocking later editing',()=>{
 const field={};const state=imeState(field);state.active=true;
 assert.equal(imeKeyBlocked(field,{timeStamp:10}),true);state.active=false;state.endedAt=20;
 assert.equal(imeKeyBlocked(field,{timeStamp:21}),true);assert.equal(imeKeyBlocked(field,{timeStamp:101}),false);
 assert.equal(imeKeyBlocked(field,{timeStamp:102,keyCode:229}),true);assert.equal(imeKeyBlocked(field,{timeStamp:103,isComposing:true}),true);
 assert.equal(imeKeyBlocked({},{timeStamp:21}),false);
});
test('all form fields guard submission, and composition state is isolated by native element',()=>{
 const word={},meaning={},form={querySelectorAll:()=>[word,meaning]};imeState(meaning).active=true;
 assert.equal(formIsComposing(form),true);assert.equal(imeBlocksSubmit(form,1),true);assert.equal(imeState(word).active,false);
 imeState(meaning).active=false;imeState(meaning).endedAt=10;assert.equal(imeBlocksSubmit(form,11),true);assert.equal(imeBlocksSubmit(form,100),false);assert.equal(formIsComposing(form),false);
});

test('explicit pointer or focused-button save works immediately; implicit IME Enter remains blocked',async()=>{
 const keys=['Element','HTMLButtonElement','HTMLInputElement','document'];const previous=Object.fromEntries(keys.map(key=>[key,globalThis[key]]));
 class Element{closest(){return this;}}class Button extends Element{type='submit';}class Input extends Element{}
 const field={},listeners=new Set(),form={querySelectorAll:()=>[field],addEventListener:(_type,listener)=>listeners.add(listener),removeEventListener:(_type,listener)=>listeners.delete(listener)},button=new Button();button.form=form;
 const document={activeElement:field};Object.assign(globalThis,{Element,HTMLButtonElement:Button,HTMLInputElement:Input,document});
 try{
  const stop=trackExplicitImeSubmit(form),stopSecond=trackExplicitImeSubmit(form);assert.equal(listeners.size,1);
  const click=(detail,timeStamp)=>{for(const listener of listeners)listener({target:button,detail,timeStamp});};
  imeState(field).endedAt=100;assert.equal(imeBlocksSubmit(form,101),true);
  click(1,102);assert.equal(imeBlocksSubmit(form,103),false);assert.equal(imeBlocksSubmit(form,104),true);
  click(0,105);assert.equal(imeBlocksSubmit(form,106),true);
  document.activeElement=button;click(0,107);assert.equal(imeBlocksSubmit(form,108),false);
  imeState(field).active=true;click(1,109);assert.equal(imeBlocksSubmit(form,110),true);imeState(field).active=false;assert.equal(imeBlocksSubmit(form,111),true);
  document.activeElement=field;imeState(field).endedAt=200;click(1,201);await new Promise(resolve=>setTimeout(resolve,1));assert.equal(imeBlocksSubmit(form,202),true);
  stop();assert.equal(listeners.size,1);stopSecond();assert.equal(listeners.size,0);
 }finally{for(const key of keys){if(previous[key]===undefined)delete globalThis[key];else globalThis[key]=previous[key];}}
});
