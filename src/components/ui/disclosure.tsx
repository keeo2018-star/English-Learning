'use client';
import { useState, type ReactNode } from 'react';
import { Icon } from './icon';

export function Disclosure({ label, children, className='', lazy=false }:{
  label:string; children:ReactNode; className?:string; lazy?:boolean;
}) {
  const [opened,setOpened]=useState(false);
  return <details className={`wb-disclosure ${className}`} onToggle={event=>setOpened(event.currentTarget.open)}>
    <summary>{label}<Icon name="chevronDown" size={16}/></summary>
    {(!lazy||opened)&&children}
  </details>;
}
