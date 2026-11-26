'use client';

import { useEffect } from 'react';

export function KeyboardViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = document.querySelector<HTMLElement>('.wb-app');
    if (!viewport || !shell) return;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        const editing = active?.matches('textarea, input:not([type=checkbox]):not([type=radio]), [contenteditable="true"]');
        const root = document.documentElement;
        const occlusion = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
        const modal = document.querySelector('dialog[open]') !== null;
        const keyboard = !!editing && viewport.scale === 1 && window.innerHeight - viewport.height > 80;
        root.toggleAttribute('data-wb-modal-keyboard', keyboard && modal);
        if (keyboard && modal) {
          root.style.setProperty('--wb-sheet-viewport', `${viewport.height}px`);
          root.style.setProperty('--wb-sheet-bottom', `${occlusion}px`);
        } else {
          root.style.removeProperty('--wb-sheet-viewport');
          root.style.removeProperty('--wb-sheet-bottom');
        }
        if (keyboard && !modal) shell.style.setProperty('--wb-keyboard-viewport', `${viewport.height}px`);
        else shell.style.removeProperty('--wb-keyboard-viewport');
      });
    };
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    document.addEventListener('focusin', resize);
    document.addEventListener('focusout', resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
      document.documentElement.removeAttribute('data-wb-modal-keyboard');
      document.documentElement.style.removeProperty('--wb-sheet-viewport');
      document.documentElement.style.removeProperty('--wb-sheet-bottom');
      document.removeEventListener('focusin', resize);
      document.removeEventListener('focusout', resize);
      shell.style.removeProperty('--wb-keyboard-viewport');
    };
  }, []);
  return null;
}
