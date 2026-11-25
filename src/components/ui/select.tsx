import type { ComponentProps } from 'react';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={['wb-select', className].filter(Boolean).join(' ')} />;
}
