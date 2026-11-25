"use client";
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {adaptiveState} from './add-editor';
function prepareMirror(el:HTMLTextAreaElement|null,m:HTMLDivElement|null,size?:number){if(!el||!m)return null;const css=getComputedStyle(el);Object.assign(m.style,{width:el.clientWidth+'px',fontFamily:css.fontFamily,fontWeight:css.fontWeight,fontSize:size===undefined?css.fontSize:size+'px',lineHeight:css.lineHeight,letterSpacing:css.letterSpacing,padding:css.padding});return {el,m,css};}
export function useAdaptiveEditor(input:RefObject<HTMLTextAreaElement|null>,value:string,composing:boolean){
 const [scale,setScale]=useState(0),[viewport,setViewport]=useState(0),[placement,setPlacement]=useState({above:false,height:240});
 const mirror=useRef<HTMLDivElement|null>(null),probe=useRef<HTMLSpanElement|null>(null),generation=useRef(0);

 useLayoutEffect(()=>{
  if(composing)return;
  const data=prepareMirror(input.current,mirror.current);if(!data)return;const {el,m,css}=data,oldScroll=el.scrollTop;
  el.style.height='0px';const border=parseFloat(css.borderTopWidth)+parseFloat(css.borderBottomWidth),height=el.scrollHeight+border+2,min=Math.max(62,Math.ceil(parseFloat(css.lineHeight)+parseFloat(css.paddingTop)+parseFloat(css.paddingBottom)+border+2)),max=Math.max(min,96,Math.min(320,(window.visualViewport?.height||window.innerHeight)*.36));
  el.style.height=Math.max(min,Math.min(height,max))+'px';el.style.overflowY=height>max?'auto':'hidden';el.scrollTop=oldScroll;
  if(document.activeElement===el){m.textContent=el.value.slice(0,el.selectionEnd)+'\u200b';const line=parseFloat(css.lineHeight),caret=m.getBoundingClientRect().height-parseFloat(css.paddingBottom)-line;
   if(caret<el.scrollTop)el.scrollTop=Math.max(0,caret-parseFloat(css.paddingTop));else if(caret+line>el.scrollTop+el.clientHeight)el.scrollTop=caret+line-el.clientHeight+parseFloat(css.paddingBottom);
  }
 },[value,scale,viewport,input,composing]);
 useEffect(()=>{
  if(composing)return;const ticket=++generation.current;
  const measure=(growth:boolean)=>{if(ticket!==generation.current||!input.current||!probe.current||input.current.selectionStart!==input.current.selectionEnd)return;const lines:number[]=[];
   for(let i=0;i<5;i++){probe.current.dataset.scale=String(i);const p=getComputedStyle(probe.current),data=prepareMirror(input.current,mirror.current,parseFloat(p.fontSize));if(!data)return;data.m.style.lineHeight=p.lineHeight;data.m.style.letterSpacing=p.letterSpacing;data.m.textContent=value+'\u200b';const height=data.m.getBoundingClientRect().height-parseFloat(data.css.paddingTop)-parseFloat(data.css.paddingBottom);lines.push(Math.max(1,height/parseFloat(p.lineHeight)));}
   setScale(old=>adaptiveState(old,lines,growth));
  };
  const shrink=setTimeout(()=>measure(false),350),grow=setTimeout(()=>measure(true),1000);return()=>{clearTimeout(shrink);clearTimeout(grow)};
 },[value,composing,viewport,input]);
 useEffect(()=>{
  const el=input.current;if(!el)return;
  const scrollport=el.closest<HTMLElement>('.wb-app-frame');
  let active=true,lastWidth=0,lastRoot=0;
  let visibleTimer:ReturnType<typeof setTimeout>|undefined;
  const update=()=>{
    if(!active)return;
    const width=el.clientWidth,root=parseFloat(getComputedStyle(document.documentElement).fontSize);
    if(width!==lastWidth||root!==lastRoot){lastWidth=width;lastRoot=root;setViewport(x=>x+1);}
    const field=el.getBoundingClientRect(),viewport=window.visualViewport,frame=scrollport?.getBoundingClientRect();
    const top=Math.max(frame?.top||0,viewport?.offsetTop||0);
    const bottom=Math.min(frame?.bottom??Infinity,(viewport?.offsetTop||0)+(viewport?.height||innerHeight));
    const above=field.top-top-8,below=bottom-field.bottom-8,useAbove=above>=180||(below<150&&above>below);
    setPlacement({above:useAbove,height:Math.max(44,Math.min(240,useAbove?above:below))});
  };
  const resize=()=>{
    setViewport(x=>x+1);update();clearTimeout(visibleTimer);
    visibleTimer=setTimeout(()=>{
      if(!active||document.activeElement!==el)return;
      el.scrollIntoView({block:'nearest',behavior:'instant'});
      update();
    },120);
  };
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null;
  observer?.observe(el);if(probe.current)observer?.observe(probe.current);
  window.addEventListener('resize',resize);
  scrollport?.addEventListener('scroll',update,{passive:true});
  window.visualViewport?.addEventListener('resize',resize);
  window.visualViewport?.addEventListener('scroll',update);
  void document.fonts.ready.then(()=>{if(active){setViewport(x=>x+1);update();}});update();
  return()=>{
    active=false;clearTimeout(visibleTimer);observer?.disconnect();
    window.removeEventListener('resize',resize);
    scrollport?.removeEventListener('scroll',update);
    window.visualViewport?.removeEventListener('resize',resize);
    window.visualViewport?.removeEventListener('scroll',update);
  };
 },[input]);
 return {scale,mirror,probe,placement,reset:()=>setScale(0)};
}
