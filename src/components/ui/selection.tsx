import Link from 'next/link';
import type { ComponentProps } from 'react';

// One semantic contract for all selected controls, including future filters.
export const selectedControlSelector = [
  '[data-selected="true"]',
  'a[aria-current="page"]',
  'a[aria-current="true"]',
  'button[aria-pressed="true"]',
  '[role="tab"][aria-selected="true"]',
  '[role="option"][aria-selected="true"]',
  '[role="radio"][aria-checked="true"]',
  '[role="switch"][aria-checked="true"]',
].join(',');

export function SelectableLink({ selected, className = '', ...props }: ComponentProps<typeof Link> & { selected: boolean }) {
  return <Link {...props} className={`wb-selectable ${className}`} data-selected={selected || undefined}
    aria-current={selected ? 'page' : undefined} />;
}
export function SelectableButton({ selected, className = '', ...props }: ComponentProps<'button'> & { selected: boolean }) {
  return <button type="button" {...props} className={`wb-selectable ${className}`} data-selected={selected || undefined}
    aria-pressed={selected} />;
}
export function SelectableToggle({ children, checked, onChange, className = '' }: {
  children: React.ReactNode; checked: boolean; onChange: ComponentProps<'input'>['onChange']; className?: string;
}) {
  return <label className={`wb-selectable wb-toggle ${className}`} data-selected={checked || undefined}>
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span aria-hidden="true">{checked ? '✓' : '○'}</span>{children}
  </label>;
}
