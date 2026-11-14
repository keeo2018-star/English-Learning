import test from 'node:test';import assert from 'node:assert/strict';
import {imeState,imeKeyBlocked,imeBlocksSubmit,formIsComposing} from '../../src/lib/ime.ts';
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
