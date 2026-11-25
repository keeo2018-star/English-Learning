'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Sheet({ title, onClose, busy, children }: {
  title: string; onClose: () => void; busy?: boolean; children: ReactNode;
}) {
  const element = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = element.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={element} className="language-sheet" aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id={heading}>{title}</h2>
    {children}
    <div className="wb-sheet-toast-anchor" role="status" aria-live="polite" aria-atomic="true"/>
  </dialog>;
}
