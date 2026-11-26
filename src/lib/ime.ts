// DOM-local composition state avoids rerendering or changing a native preedit value.
export type ImeState={active:boolean;endedAt:number};
const states=new WeakMap<Element,ImeState>();
const explicitSubmits=new WeakMap<HTMLFormElement,number>();
const submitTracking=new WeakMap<HTMLFormElement,{count:number;listener:(event:MouseEvent)=>void}>();
// A genuine button activation is different from the synthetic click generated
// by an input's trailing IME Enter. Keep the latter protected for Safari.
export function trackExplicitImeSubmit(form:HTMLFormElement){
 let tracking=submitTracking.get(form);
 if(!tracking){
  const listener=(event:MouseEvent)=>{
   const target=event.target instanceof Element?event.target.closest('button,input[type=submit]'):null;
   if(!(target instanceof HTMLButtonElement||target instanceof HTMLInputElement)||target.form!==form||target.type!=='submit')return;
   if((event.detail>0||document.activeElement===target)&&!formIsComposing(form)){
    const stamp=event.timeStamp;explicitSubmits.set(form,stamp);
    // Only the default submit belonging to this activation may use it. An
    // invalid form must not leave permission for a later IME Enter.
    setTimeout(()=>{if(explicitSubmits.get(form)===stamp)explicitSubmits.delete(form);},0);
   }else explicitSubmits.delete(form);
  };
  tracking={count:0,listener};submitTracking.set(form,tracking);form.addEventListener('click',listener,true);
 }
 tracking.count++;
 return()=>{if(--tracking.count===0){form.removeEventListener('click',tracking.listener,true);submitTracking.delete(form);explicitSubmits.delete(form);}};
}
export function imeState(element:Element):ImeState {
 let state=states.get(element);if(!state){state={active:false,endedAt:-Infinity};states.set(element,state);}return state;
}
export function imeKeyBlocked(element:Element,event:{isComposing?:boolean;keyCode?:number;timeStamp:number}) {
 const state=imeState(element);return state.active||!!event.isComposing||event.keyCode===229||(event.timeStamp>=state.endedAt&&event.timeStamp-state.endedAt<80);
}
export function formIsComposing(form:ParentNode|null|undefined) {
 return !!form&&Array.from(form.querySelectorAll('input,textarea')).some(el=>imeState(el).active);
}
export function imeBlocksSubmit(form:HTMLFormElement,timeStamp:number) {
 const explicit=explicitSubmits.get(form);explicitSubmits.delete(form);
 if(formIsComposing(form))return true;
 if(explicit!==undefined&&timeStamp>=explicit&&timeStamp-explicit<1000)return false;
 return Array.from(form.querySelectorAll('input,textarea')).some(el=>imeKeyBlocked(el,{timeStamp}));
}
