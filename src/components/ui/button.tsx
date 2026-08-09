import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 disabled:pointer-events-none';
    const variants = {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
      secondary: 'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700',
      danger: 'bg-rose-600 text-white hover:bg-rose-700',
      ghost: 'bg-transparent text-slate-300 hover:text-white hover:bg-slate-800',
    };
    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 py-2 text-sm',
      lg: 'h-12 px-6 py-3 text-base',
    };
    return (
      <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
    );
  }
);
Button.displayName = 'Button';
