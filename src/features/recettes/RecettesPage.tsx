import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText } from '../../components/ui/Field'
import { api, messageOf } from '../../lib/api'
import { expiryLabel, todayIso } from '../../lib/dates'
import type { RecipeSuggestion } from '../../lib/types'

interface Reponse {
  recipes: RecipeSuggestion[]
  /** Recettes dont aucun ingrédient n'est structuré dans Mealie : injugeables. */
  ignored: number
  stale: boolean
  fetchedAt: number | null
  linkCount: number
  foodCount: number
}

/* Trois ingrédients manquants, c'est encore une course d'appoint ; au-delà, ce
   n'est plus « ce qu'on a », c'est un menu à faire. */
const CHOIX_MANQUANTS = [0, 1, 2, 3]

export function RecettesPage() {
  const [data, setData] = useState<Reponse | null>(null)
  const [max, setMax] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const charger = useCallback(async (maxMissing: number) => {
    setLoading(true)
    try {
      const res = await api.get<Reponse>(
        `/api/mealie/recettes?today=${todayIso()}&max=${maxMissing}`,
      )
      setData(res)
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Recettes indisponibles.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void charger(max)
  }, [charger, max])

  async function rafraichir() {
    setRefreshing(true)
    setError(null)
    try {
      await api.post('/api/mealie/refresh')
      await charger(max)
    } catch (err) {
      setError(messageOf(err, 'Mealie est injoignable.'))
    } finally {
      setRefreshing(false)
    }
  }

  const recettes = data?.recipes ?? []
  const aSauver = recettes.filter((r) => r.urgent)
  const autres = recettes.filter((r) => !r.urgent)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Ce soir</h1>
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
            Aucun ingrédient n'est encore relié à vos produits : Gestock ne peut donc rien deviner
            de vos {data.foodCount} aliments Mealie.
          </p>
          <Link to="/recettes/liens">
            <Button>Commencer les correspondances</Button>
          </Link>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Ingrédients manquants tolérés :</span>
        {CHOIX_MANQUANTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setMax(n)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              max === n
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {n === 0 ? 'aucun' : n}
          </button>
        ))}
      </div>

      {loading ? <p className="py-6 text-center text-slate-500">Recherche…</p> : null}

      {!loading && aSauver.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold tracking-wide text-amber-300 uppercase">
            À sauver
          </h2>
          <p className="px-1 text-xs text-slate-500">
            Ces recettes utilisent un lot dont la date approche.
          </p>
          {aSauver.map((recette) => (
            <RecetteCard key={recette.slug} recette={recette} />
          ))}
        </section>
      ) : null}

      {!loading && autres.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold tracking-wide text-slate-400 uppercase">
            Avec ce qu'il y a
          </h2>
          {autres.map((recette) => (
            <RecetteCard key={recette.slug} recette={recette} />
          ))}
        </section>
      ) : null}

      {!loading && recettes.length === 0 && data && data.linkCount > 0 ? (
        <Card className="text-center text-sm text-slate-400">
          Rien ne sort avec {max === 0 ? 'aucun ingrédient manquant' : `${max} manquant(s)`}.
          Élargissez la tolérance, ou reliez d'autres aliments.
        </Card>
      ) : null}

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
    </div>
  )
}

function RecetteCard({ recette }: { recette: RecipeSuggestion }) {
  return (
    <a
      href={recette.url}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 hover:border-slate-700"
    >
      <img
        src={recette.image}
        alt=""
        loading="lazy"
        className="h-20 w-20 shrink-0 rounded-lg border border-slate-800 bg-slate-950 object-cover"
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden'
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-100">{recette.name}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {[recette.totalTime, recette.servings ? `${recette.servings} parts` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>

        {recette.uses.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1">
            {recette.uses.slice(0, 4).map((use) => (
              <li
                key={use.lotId}
                className={`rounded border px-1.5 py-0.5 text-[0.65rem] ${
                  use.level === 'perime' || use.level === 'urgent'
                    ? 'border-red-800 bg-red-950 text-red-300'
                    : use.level === 'bientot'
                      ? 'border-amber-800 bg-amber-950 text-amber-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400'
                }`}
              >
                {use.productName}
                {use.expiresAt ? ` · ${expiryLabel(use.expiresAt)}` : ''}
              </li>
            ))}
          </ul>
        ) : null}

        {recette.missing.length > 0 ? (
          <p className="mt-2 text-xs text-slate-400">
            Manque : {recette.missing.map((m) => m.name).join(', ')}
          </p>
        ) : null}

        {recette.freeText > 0 ? (
          <p className="mt-1 text-[0.65rem] text-slate-600">
            {recette.freeText} ingrédient(s) en texte libre, non vérifiés
          </p>
        ) : null}
      </div>
    </a>
  )
}
