import { NavLink } from 'react-router-dom'
import { useInventaire } from '../hooks/useInventaire'
import { expiryLevel } from '../lib/dates'

const TABS = [
  { to: '/inventaire', label: 'Inventaire', icon: '🧺' },
  { to: '/ajouter', label: 'Ajouter', icon: '＋' },
  { to: '/alertes', label: 'Alertes', icon: '⏳' },
  { to: '/reserves', label: 'Réserves', icon: '🗄️' },
  { to: '/compte', label: 'Compte', icon: '👤' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[0.7rem] font-medium transition-colors sm:flex-row sm:gap-2 sm:text-sm ${
    isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  }`

export function NavBar() {
  const { lots } = useInventaire()
  // Ce qui presse : périmé ou sur le point de l'être. Le compte est porté par
  // l'onglet plutôt que par une notification — l'appli s'ouvre déjà pour ça.
  const pressing = lots.filter((lot) => {
    const level = expiryLevel(lot.expiresAt)
    return level === 'perime' || level === 'urgent'
  }).length

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:sticky sm:top-0 sm:bottom-auto sm:border-t-0 sm:border-b sm:pb-0">
      <div className="mx-auto flex max-w-3xl items-stretch gap-1 px-2 py-1 sm:justify-start sm:px-4 sm:py-2">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={linkClass}>
            <span className="relative text-lg leading-none sm:text-base">
              {tab.icon}
              {tab.to === '/alertes' && pressing > 0 ? (
                <span className="absolute -top-1 -right-2 min-w-4 rounded-full bg-red-500 px-1 text-[0.6rem] leading-4 font-bold text-white">
                  {pressing > 99 ? '99+' : pressing}
                </span>
              ) : null}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
