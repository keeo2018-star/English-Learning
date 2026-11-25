import type { ReactNode } from 'react';

export function PageHeader({ title, children, brand = false }: { title: ReactNode; children?: ReactNode; brand?: boolean }) {
  return <header className={`learning-header${brand ? ' wb-masthead' : ''}`}>
    {brand ? title : <h1>{title}</h1>}
    {children}
  </header>;
}
