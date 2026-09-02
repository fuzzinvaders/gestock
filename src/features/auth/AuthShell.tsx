import type { ReactNode } from 'react'

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-4xl">🧺</div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-100">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">{children}</div>
      </div>
    </div>
  )
}
