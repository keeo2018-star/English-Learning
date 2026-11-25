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
        const editing = document.activeElement?.matches('textarea, input, [contenteditable="true"]');
        if (editing && viewport.scale === 1 && viewport.height < shell.clientHeight && window.innerHeight > viewport.height) {
          shell.style.setProperty('--wb-keyboard-viewport', `${viewport.height}px`);
        } else if (!editing || viewport.scale !== 1 || window.innerHeight <= viewport.height) {
          shell.style.removeProperty('--wb-keyboard-viewport');
        } else if (shell.style.getPropertyValue('--wb-keyboard-viewport')) {
          shell.style.setProperty('--wb-keyboard-viewport', `${viewport.height}px`);
        }
      });
    };
    viewport.addEventListener('resize', resize);
    document.addEventListener('focusin', resize);
    document.addEventListener('focusout', resize);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', resize);
      document.removeEventListener('focusin', resize);
      document.removeEventListener('focusout', resize);
      shell.style.removeProperty('--wb-keyboard-viewport');
    };
  }, []);
  return null;
}
