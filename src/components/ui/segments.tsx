import type { ReactNode } from 'react';

export function Segments({ label, children }: { label: string; children: ReactNode }) {
  return <div className="wb-segments" role="group" aria-label={label}>{children}</div>;
}
