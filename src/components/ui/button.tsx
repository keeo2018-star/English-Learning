import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'destructive' | 'toggle';
  size?: 'large' | 'medium' | 'small' | 'icon';
  compactSurface?: boolean;
};

export function Button({
  variant = 'primary', size = 'large', compactSurface, type = 'button', className = '', children, ...props
}: ButtonProps) {
  return <button {...props} type={type} className={`wb-button ${className}`} data-button-variant={variant}
    data-button-size={size} data-button-surface={compactSurface || undefined}>
    {compactSurface ? <span className="wb-button-surface">{children}</span> : children}
  </button>;
}
