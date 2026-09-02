import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Input } from '../../components/ui/Field'
import { api, messageOf } from '../../lib/api'
import { todayIso } from '../../lib/dates'
import type { RecipeCross } from '../../lib/types'
import { RecetteModal } from './RecetteModal'

interface Reponse {
  recipes: RecipeCross[]
  /** Recettes dont aucun ingrédient n'est structuré dans Mealie : injugeables. */
  ignored: number
  stale: boolean
  fetchedAt: number | null
  linkCount: number
  foodCount: number
}

type Mode = 'toutes' | 'completes' | 'sauver'

const MODES: { value: Mode; label: string }[] = [
  { value: 'toutes', label: 'Toutes' },
  { value: 'completes', label: 'Rien à acheter' },
  { value: 'sauver', label: 'À sauver' },
]

/**
 * Le carnet de recettes, vu depuis les placards.
 *
 * On part de la recette : on la cherche, on l'ouvre, et on voit ce qu'on a déjà —
 * pour ne pas racheter ce qui est au fond du congélateur. Le classement par
 * péremption n'est qu'un filtre parmi les trois.
 */
export function RecettesPage() {
  const [data, setData] = useState<Reponse | null>(null)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<Mode>('toutes')
  const [ouverte, setOuverte] = useState<RecipeCross | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const charger = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api.get<Reponse>(`/api/mealie/recettes?today=${todayIso()}`))
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Recettes indisponibles.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  async function rafraichir() {
    setRefreshing(true)
    setError(null)
    try {
      await api.post('/api/mealie/refresh')
      await charger()
    } catch (err) {
      setError(messageOf(err, 'Mealie est injoignable.'))
    } finally {
      setRefreshing(false)
    }
  }

  /* Tout le carnet est déjà là : chercher et trier ne demande plus le réseau,
     ce qui rend la frappe instantanée même sur un vieux téléphone. */
  const visibles = useMemo(() => {
    const besoin = search.trim().toLowerCase()
    const liste = (data?.recipes ?? []).filter((r) => {
      if (besoin && !r.name.toLowerCase().includes(besoin)) return false
      if (mode === 'completes') return r.missingCount === 0
      if (mode === 'sauver') return r.urgent
      return true
    })
    return [...liste].sort((a, b) => {
      if (mode === 'sauver' && a.soonest !== b.soonest) {
        return String(a.soonest).localeCompare(String(b.soonest))
      }
      // Le plus proche d'être faisable d'abord : c'est la question qu'on se pose
      // en ouvrant l'écran.
      if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount
      return a.name.localeCompare(b.name, 'fr')
    })
  }, [data, mode, search])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Recettes</h1>
        <Link
          to="/recettes/liens"
          className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Correspondances
        </Link>
      </div>

      <ErrorText>{error}</ErrorText>

      {data && data.linkCount === 0 ? (
        <Card className="space-y-3 text-sm text-slate-400">
          <p>
            Aucun ingrédient n'est encore relié à vos produits : Gestock ne peut donc pas dire ce
            que vous avez déjà, sur aucune des recettes.
          </p>
          <Link to="/recettes/liens">
            <Button>Commencer les correspondances</Button>
          </Link>
        </Card>
      ) : null}

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Chercher une recette…"
      />

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              mode === m.value
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-500">{visibles.length} recette(s)</span>
      </div>

      {loading ? <p className="py-6 text-center text-slate-500">Chargement du carnet…</p> : null}

      {!loading && visibles.length === 0 ? (
        <Card className="text-center text-sm text-slate-400">
          {mode === 'sauver'
            ? 'Aucune recette ne consomme un lot qui périme dans la semaine.'
            : 'Aucune recette ne correspond.'}
        </Card>
      ) : null}

      <ul className="space-y-2">
        {visibles.map((recette) => (
          <li key={recette.slug}>
            <RecetteLigne recette={recette} onClick={() => setOuverte(recette)} />
          </li>
        ))}
      </ul>

      {data && data.ignored > 0 ? (
        <p className="px-1 text-xs text-slate-600">
          {data.ignored} recette(s) écartée(s) : leurs ingrédients sont saisis en texte libre dans
          Mealie, donc impossibles à confronter au placard.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 pt-2 text-xs text-slate-600">
        <span>
          {data?.fetchedAt
            ? `Carnet relu le ${new Date(data.fetchedAt).toLocaleString('fr-FR')}`
            : 'Carnet jamais lu'}
          {data?.stale ? ' · à rafraîchir' : ''}
        </span>
        <Button variant="ghost" onClick={rafraichir} disabled={refreshing} className="text-xs">
          {refreshing ? 'Lecture…' : 'Relire Mealie'}
        </Button>
      </div>

      {ouverte ? (
        <RecetteModal
          recette={data?.recipes.find((r) => r.slug === ouverte.slug) ?? ouverte}
          onClose={() => setOuverte(null)}
        />
      ) : null}
    </div>
  )
}

function RecetteLigne({ recette, onClick }: { recette: RecipeCross; onClick: () => void }) {
  const complet = recette.missingCount === 0
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-left hover:border-slate-700"
    >
      <img
        src={recette.image}
        alt=""
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-lg border border-slate-800 bg-slate-950 object-cover"
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden'
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-slate-100">{recette.name}</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {[recette.totalTime, recette.servings ? `${recette.servings} parts` : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
              complet
                ? 'border-emerald-800 bg-emerald-950 text-emerald-300'
                : 'border-slate-700 bg-slate-800 text-slate-400'
            }`}
          >
            {complet
              ? 'rien à acheter'
              : `${recette.missingCount} à acheter · ${recette.haveCount} en stock`}
          </span>
          {recette.urgent ? (
            <span className="rounded border border-amber-800 bg-amber-950 px-1.5 py-0.5 text-[0.65rem] text-amber-300">
              utilise un lot qui presse
            </span>
          ) : null}
        </span>
      </span>
    </button>
  )
}
