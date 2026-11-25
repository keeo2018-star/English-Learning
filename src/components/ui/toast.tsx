'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const anchor = typeof document === 'undefined' ? null : document.querySelector('dialog[open] .wb-sheet-toast-anchor') ?? document.getElementById('wb-toast-anchor');
  useEffect(() => {
    const timer = setTimeout(onDismiss, 2800);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return anchor ? createPortal(<div className="wb-toast">
    <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 10 4 4 8-8"/></svg>
    {message}
  </div>, anchor) : null;
}
