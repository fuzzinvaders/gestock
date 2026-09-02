import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const controlClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClass} ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} ${className}`} {...props} />
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{children}</p>
}
