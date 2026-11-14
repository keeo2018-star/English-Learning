"use client";
import {forwardRef,useLayoutEffect,useImperativeHandle,useRef,useState,type ComponentProps,type CompositionEvent,type KeyboardEvent,type Ref} from 'react';
import {imeState,imeKeyBlocked} from '@/lib/ime';
type Field=HTMLInputElement|HTMLTextAreaElement;
type Options<T extends Field>={value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;onImeStateChange?:(active:boolean)=>void;onCompositionStart?:(event:CompositionEvent<T>)=>void;onCompositionUpdate?:(event:CompositionEvent<T>)=>void;onCompositionEnd?:(event:CompositionEvent<T>)=>void;onKeyDown?:(event:KeyboardEvent<T>)=>void};
function useNativeIme<T extends Field>(props:Options<T>,ref:Ref<T>){
 const element=useRef<T>(null),[initial]=useState(()=>props.value??props.defaultValue??'');
 const delivered=useRef(initial);
 useImperativeHandle(ref,()=>element.current!,[]);
 useLayoutEffect(()=>{const el=element.current;if(!el||props.value===undefined||imeState(el).active)return;
  if(el.value!==props.value)el.value=props.value;delivered.current=props.value;
 },[props.value]);
 function begin(el:T){const state=imeState(el);if(!state.active){state.active=true;props.onImeStateChange?.(true);}}
 function commit(el:T){if(el.value!==delivered.current){delivered.current=el.value;props.onValueChange?.(el.value);}}
 return {ref:element,defaultValue:initial,
  onChange:(event:React.ChangeEvent<T>)=>{const el=event.currentTarget;if((event.nativeEvent as InputEvent).isComposing)begin(el);if(!imeState(el).active)commit(el);},
  onCompositionStart:(event:CompositionEvent<T>)=>{begin(event.currentTarget);props.onCompositionStart?.(event);},
  onCompositionUpdate:(event:CompositionEvent<T>)=>{begin(event.currentTarget);props.onCompositionUpdate?.(event);},
  onCompositionEnd:(event:CompositionEvent<T>)=>{const el=event.currentTarget,state=imeState(el);state.active=false;state.endedAt=event.timeStamp;commit(el);props.onImeStateChange?.(false);props.onCompositionEnd?.(event);},
  onKeyDown:(event:KeyboardEvent<T>)=>{if(imeKeyBlocked(event.currentTarget,{timeStamp:event.timeStamp,isComposing:event.nativeEvent.isComposing,keyCode:event.keyCode})){
    // Never cancel a live candidate-confirmation key. Only suppress a trailing
    // Enter after compositionend, which Safari may report as an ordinary key.
    if(event.key==='Enter'&&!imeState(event.currentTarget).active&&!event.nativeEvent.isComposing&&event.keyCode!==229)event.preventDefault();
    return;
   }props.onKeyDown?.(event);},
 };
}
type TextareaProps=Omit<ComponentProps<'textarea'>,'value'|'defaultValue'|'onChange'|'onCompositionStart'|'onCompositionUpdate'|'onCompositionEnd'|'onKeyDown'>&Options<HTMLTextAreaElement>;
type InputProps=Omit<ComponentProps<'input'>,'value'|'defaultValue'|'onChange'|'onCompositionStart'|'onCompositionUpdate'|'onCompositionEnd'|'onKeyDown'>&Options<HTMLInputElement>;
export const ImeTextarea=forwardRef<HTMLTextAreaElement,TextareaProps>(function ImeTextarea({value,defaultValue,onValueChange,onImeStateChange,onCompositionStart,onCompositionUpdate,onCompositionEnd,onKeyDown,...rest},ref){
 const native=useNativeIme<HTMLTextAreaElement>({value,defaultValue,onValueChange,onImeStateChange,onCompositionStart,onCompositionUpdate,onCompositionEnd,onKeyDown},ref);
 return <textarea data-ime-field="true" {...rest} {...native}/>;
});
export const ImeInput=forwardRef<HTMLInputElement,InputProps>(function ImeInput({value,defaultValue,onValueChange,onImeStateChange,onCompositionStart,onCompositionUpdate,onCompositionEnd,onKeyDown,...rest},ref){
 const native=useNativeIme<HTMLInputElement>({value,defaultValue,onValueChange,onImeStateChange,onCompositionStart,onCompositionUpdate,onCompositionEnd,onKeyDown},ref);
 return <input data-ime-field="true" {...rest} {...native}/>;
});
