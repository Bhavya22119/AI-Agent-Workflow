import React from 'react';

export function Card({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass rounded-xl p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}
