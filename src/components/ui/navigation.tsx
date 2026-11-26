"use client";
import {prepareReviewPronunciation,stopPronunciation} from '@/lib/pronunciation';
import {SelectableLink} from './selection';
import {Icon,type IconName} from './icon';
const entries: {label:NavigationSection;href:string;icon:IconName}[]=[
 {label:'Home',href:'/',icon:'home'},{label:'Add',href:'/add',icon:'add'},{label:'Discover',href:'/discover',icon:'discover'},
 {label:'Review',href:'/review',icon:'review'},{label:'Profile',href:'/auth',icon:'profile'},
];
export type NavigationSection='Home'|'Add'|'Discover'|'Review'|'Profile';
export function Navigation({active='Home'}:{active?:NavigationSection|null}){return <nav className="wb-navigation" aria-label="Main navigation">{entries.map(item=><SelectableLink key={item.label} href={item.href} selected={item.label===active} className="wb-nav-item" onClick={event=>{if(!navigator.onLine){event.preventDefault();window.location.assign(item.href);return;}if(item.label==='Review'){if(window.location.pathname!=='/review'||new URLSearchParams(window.location.search).get('mode')==='random'){stopPronunciation();prepareReviewPronunciation(false);}else prepareReviewPronunciation();}}}><span aria-hidden="true"><Icon name={item.icon} size={24}/></span><span>{item.label}</span></SelectableLink>)}</nav>;}
