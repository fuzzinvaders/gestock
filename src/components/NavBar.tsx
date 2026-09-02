import { NavLink } from 'react-router-dom'
import { useInventaire } from '../hooks/useInventaire'
import { expiryLevel } from '../lib/dates'

/* Cinq onglets tiennent sur un téléphone étroit, pas six. Le compte n'est pas une
   fonction quotidienne — mot de passe, invitations, export — il part donc dans un
   coin d'en-tête, comme partout ailleurs, et laisse sa place aux réserves et aux
   recettes. Sur un écran large, tout revient dans la même barre. */
const TABS = [
  { to: '/inventaire', label: 'Inventaire', icon: '🧺' },
  { to: '/ajouter', label: 'Ajouter', icon: '＋' },
  { to: '/alertes', label: 'Alertes', icon: '⏳' },
  { to: '/reserves', label: 'Réserves', icon: '🗄️' },
]

const ONGLET_RECETTES = { to: '/recettes', label: 'Recettes', icon: '🍲' }

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[0.65rem] font-medium transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
    isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  }`

export function NavBar() {
  const { lots, mealie } = useInventaire()
  const tabs = mealie?.configured ? [...TABS, ONGLET_RECETTES] : TABS

  // Ce qui presse : périmé ou sur le point de l'être. Le compte est porté par
  // l'onglet plutôt que par une notification — l'appli s'ouvre déjà pour ça.
  const pressing = lots.filter((lot) => {
    const level = expiryLevel(lot.expiresAt)
    return level === 'perime' || level === 'urgent'
  }).length

  return (
    <>
      {/* En-tête réservé au téléphone : le nom, et l'accès au compte. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur sm:hidden">
        <span className="font-semibold text-slate-200">Gestock</span>
        <NavLink
          to="/compte"
          className={({ isActive }) =>
            `rounded-lg px-2 py-1 text-sm ${isActive ? 'text-emerald-400' : 'text-slate-400'}`
          }
        >
          👤 Compte
        </NavLink>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:sticky sm:top-0 sm:bottom-auto sm:border-t-0 sm:border-b sm:pb-0">
        <div className="mx-auto flex max-w-3xl items-stretch gap-1 px-2 py-1 sm:justify-start sm:px-4 sm:py-2">
          {tabs.map((tab) => (
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
          {/* Sur écran large, le compte reprend sa place dans la barre : la
              contrainte de largeur qui l'en avait chassé n'existe plus. */}
          <NavLink
            to="/compte"
            className={(state) => `hidden sm:flex ${linkClass(state)}`}
          >
            <span className="text-base">👤</span>
            <span>Compte</span>
          </NavLink>
        </div>
      </nav>
    </>
  )
}
