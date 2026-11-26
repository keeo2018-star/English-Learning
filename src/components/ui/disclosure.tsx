'use client';
import { useState, type ReactNode } from 'react';
import { Icon } from './icon';

export function Disclosure({ label, children, className='', lazy=false, unmountOnClose=false }:{
  label:string; children:ReactNode; className?:string; lazy?:boolean; unmountOnClose?:boolean;
}) {
  const [opened,setOpened]=useState(false);
  const [visited,setVisited]=useState(false);
  return <details className={`wb-disclosure ${className}`} onToggle={event=>{setOpened(event.currentTarget.open);if(event.currentTarget.open)setVisited(true);}}>
    <summary>{label}<Icon name="chevronDown" size={16}/></summary>
    {(!lazy||(unmountOnClose?opened:visited))&&<div className="wb-disclosure-content">{children}</div>}
  </details>;
}
