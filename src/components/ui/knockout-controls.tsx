"use client";

import { useEffect } from "react";

import { selectedControlSelector } from "./selection";

// Rasterize the browser's laid-out label into an alpha mask. The original DOM
// remains accessible and determines sizing; only the black surface is masked.
function maskLabel(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const scaleX = bounds.width / width;
  const scaleY = bounds.height / height;
  const canvas = document.createElement('canvas');
  const density = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.ceil(width * density);
  canvas.height = Math.ceil(height * density);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(density, density);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'destination-out';
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const content = node.textContent || '';
    const start = content.search(/\S/);
    if (start < 0 || !node.parentElement) continue;
    const end = content.search(/\s*$/);
    const style = getComputedStyle(node.parentElement);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.textBaseline = 'alphabetic';
    if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
    const metrics = context.measureText('Mg');
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const draw = (text: string, rect: DOMRect) => {
      if (!rect.width || !rect.height) return;
      const baseline = (rect.top - bounds.top) / scaleY + (rect.height / scaleY - ascent - descent) / 2 + ascent;
      context.fillText(text, (rect.left - bounds.left) / scaleX, baseline);
    };
    const rects = range.getClientRects();
    if (rects.length === 1) draw(content.slice(start, end).replace(/\s+/g, ' '), rects[0]);
    else {
      // Wrapped control labels retain their actual line positions.
      for (let index = start; index < end; index++) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        draw(content[index], range.getBoundingClientRect());
      }
    }
  }
  element.style.setProperty('--wb-knockout-mask', `url("${canvas.toDataURL()}")`);
  element.style.setProperty('--wb-knockout-inset', `-${getComputedStyle(element).borderLeftWidth}`);
  element.classList.add('wb-knockout');
}

export function KnockoutControls() {
  useEffect(() => {
    if (!CSS.supports('mask-image', 'url("")') && !CSS.supports('-webkit-mask-image', 'url("")')) return;
    let frame = 0;
    let disposed = false;
    const observed = new Set<HTMLElement>();
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    function update() {
      if (disposed) return;
      const selected = new Set(document.querySelectorAll<HTMLElement>(selectedControlSelector));
      for (const element of observed) {
        if (selected.has(element)) continue;
        element.classList.remove('wb-knockout');
        element.style.removeProperty('--wb-knockout-mask');
        element.style.removeProperty('--wb-knockout-inset');
        resize.unobserve(element);
        observed.delete(element);
      }
      for (const element of selected) {
        if (!observed.has(element)) { observed.add(element); resize.observe(element); }
        maskLabel(element);
      }
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['aria-current', 'aria-pressed', 'aria-selected', 'aria-checked', 'data-selected'],
    });
    window.addEventListener('resize', schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    void document.fonts.ready.then(() => { if (!disposed) schedule(); });
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', schedule);
      document.fonts.removeEventListener('loadingdone', schedule);
      for (const element of observed) {
        element.classList.remove('wb-knockout');
        element.style.removeProperty('--wb-knockout-mask');
        element.style.removeProperty('--wb-knockout-inset');
      }
    };
  }, []);
  return null;
}
