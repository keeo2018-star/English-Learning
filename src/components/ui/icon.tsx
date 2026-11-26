import type { ComponentProps } from 'react';

const paths = {
  home: 'm3 10 9-7 9 7v10H3Zm5 10v-7h8v7', add: 'M12 4v16M4 12h16',
  discover: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  review: 'M20 11a8 8 0 1 1-2-5M20 3v6h-6',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 1 1 16 0v2',
  external: 'M6 18 18 6M8 6h10v10', left: 'm12 5-7 7 7 7M5 12h14', right: 'm12 5 7 7-7 7M5 12h14',
  chevronRight: 'm9 6 6 6-6 6', chevronLeft: 'm15 6-6 6 6 6', chevronDown: 'm6 9 6 6 6-6',
  check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M18 6 6 18', minus: 'M5 12h14',
  trash:'M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6',
  pencil: 'm15 5 4 4M4 20l4-1 12-12-4-4L4 15z',
  clipboard: 'M9 5H6a2 2 0 0 0-2 2v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a2 2 0 0 0-2-2h-3M9 3h6v5H9z',
  camera: 'M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm12 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  microphone: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6',
  volume: 'M4 9v6h4l5 4V5L8 9zm12 0a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12',
  shuffle: 'M3 6h3c5 0 6 12 11 12h4M17 14l4 4-4 4M3 18h3c5 0 6-12 11-12h4M17 2l4 4-4 4',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="wb-svg-icon" aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}

export function IconButton({ icon, label, variant = 'neutral', className = '', ...props }: ComponentProps<'button'> & {
  icon: IconName; label: string; variant?: 'neutral' | 'soft' | 'primary';
}) {
  return <button {...props} type="button" aria-label={label} className={`wb-icon-button ${className}`} data-variant={variant}>
    <span><Icon name={icon}/></span>
  </button>;
}
