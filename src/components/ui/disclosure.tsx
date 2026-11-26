import type { ReactNode } from 'react';
import { Icon } from './icon';

export function Disclosure({ label, children, className='' }:{
  label:string; children:ReactNode; className?:string;
}) {
  return <details className={`wb-disclosure ${className}`}>
    <summary>{label}<Icon name="chevronDown" size={16}/></summary>
    {children}
  </details>;
}
