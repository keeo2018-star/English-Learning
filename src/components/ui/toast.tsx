'use client';

import { useEffect } from 'react';
import { Icon } from './icon';
import { createPortal } from 'react-dom';

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const anchor = typeof document === 'undefined' ? null : document.querySelector('dialog[open] .wb-sheet-toast-anchor') ?? document.getElementById('wb-toast-anchor');
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2800);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return anchor ? createPortal(<div className="wb-toast">
    <Icon name="check" size={17}/>
    {message}
  </div>, anchor) : null;
}
