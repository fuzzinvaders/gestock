import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-900 p-4 ${className}`} {...props} />
  )
}
