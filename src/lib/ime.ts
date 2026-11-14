// DOM-local composition state avoids rerendering or changing a native preedit value.
export type ImeState={active:boolean;endedAt:number};
const states=new WeakMap<Element,ImeState>();
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
 return Array.from(form.querySelectorAll('input,textarea')).some(el=>imeKeyBlocked(el,{timeStamp}));
}
