import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Input, Select } from '../../components/ui/Field'
import { useInventaire } from '../../hooks/useInventaire'
import { api, messageOf } from '../../lib/api'
import type { PendingFood } from '../../lib/types'

/**
 * Relier les aliments de Mealie aux produits du foyer.
 *
 * L'écran est fait pour être expédié : les aliments arrivent du plus utilisé au
 * moins utilisé, avec une proposition déjà sélectionnée quand le nom concorde.
 * Une dizaine de minutes suffit à couvrir l'essentiel d'un carnet de recettes,
 * et le reste se complète au fil des soirs où il manque quelque chose.
 */
export function LiensPage() {
  const { products, links, saveLink, removeLink } = useInventaire()
  const [pending, setPending] = useState<PendingFood[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const charger = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await api.get<{ foods: PendingFood[] }>(
        `/api/mealie/aliments${q.trim().length >= 2 ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
      )
      setPending(res.foods)
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Aliments indisponibles.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Un délai avant d'interroger : la recherche part chez Mealie, inutile de
    // l'appeler à chaque lettre.
    const timer = setTimeout(() => void charger(search), search ? 350 : 0)
    return () => clearTimeout(timer)
  }, [charger, search])

  const produitsTries = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [products],
  )

  async function agir(foodId: string, action: () => Promise<void>) {
    setBusy(foodId)
    setError(null)
    try {
      await action()
      setPending((list) => list.filter((f) => f.foodId !== foodId))
    } catch (err) {
      setError(messageOf(err, 'Enregistrement impossible.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Correspondances</h1>
        <Link
          to="/recettes"
          className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Retour
        </Link>
      </div>

      <p className="text-sm text-slate-400">
        Un aliment de Mealie, un produit de vos placards. Ce qui ne s'inventorie pas — sel, huile,
        eau — se déclare « toujours là ». Ce qui reste non relié est compté comme manquant.
      </p>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Chercher un aliment dans tout Mealie…"
      />

      <ErrorText>{error}</ErrorText>

      <div className="flex items-baseline justify-between px-1 text-xs text-slate-500">
        <span>{links.length} correspondance(s) enregistrée(s)</span>
        <span>{search.trim().length >= 2 ? 'Résultats de recherche' : 'Les plus utilisés'}</span>
      </div>

      {loading ? <p className="py-6 text-center text-slate-500">Chargement…</p> : null}

      {!loading && pending.length === 0 ? (
        <Card className="text-center text-sm text-slate-400">
          {search.trim().length >= 2
            ? 'Aucun aliment ne correspond à cette recherche.'
            : 'Tous les aliments de vos recettes ont une réponse. Beau travail.'}
        </Card>
      ) : null}

      {pending.map((food) => (
        <LigneAliment
          key={food.foodId}
          food={food}
          products={produitsTries}
          busy={busy === food.foodId}
          onLier={(productId) =>
            agir(food.foodId, () =>
              saveLink(food.foodId, { foodName: food.foodName, productId, always: false }),
            )
          }
          onToujours={() =>
            agir(food.foodId, () =>
              saveLink(food.foodId, { foodName: food.foodName, productId: null, always: true }),
            )
          }
        />
      ))}

      {links.length > 0 ? (
        <section className="space-y-2 pt-4">
          <h2 className="px-1 text-sm font-semibold tracking-wide text-slate-400 uppercase">
            Déjà reliés
          </h2>
          <ul className="divide-y divide-slate-800 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            {[...links]
              .sort((a, b) => a.foodName.localeCompare(b.foodName, 'fr'))
              .map((link) => (
                <li key={link.foodId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-slate-100">{link.foodName}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {link.always
                        ? 'toujours là'
                        : (products.find((p) => p.id === link.productId)?.name ??
                          'produit disparu')}
                    </span>
                  </span>
                  <button
                    onClick={() => void removeLink(link.foodId).then(() => charger(search))}
                    className="shrink-0 text-sm text-slate-500 hover:text-red-400"
                  >
                    délier
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function LigneAliment({
  food,
  products,
  busy,
  onLier,
  onToujours,
}: {
  food: PendingFood
  products: { id: string; name: string }[]
  busy: boolean
  onLier: (productId: string) => void
  onToujours: () => void
}) {
  const [choix, setChoix] = useState(food.suggestion?.productId ?? '')

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-slate-100">{food.foodName}</span>
        {food.count > 0 ? (
          <span className="shrink-0 text-xs text-slate-500">{food.count} recette(s)</span>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Select value={choix} onChange={(e) => setChoix(e.target.value)} className="flex-1">
          <option value="">— choisir un produit —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button disabled={busy || !choix} onClick={() => onLier(choix)}>
          Lier
        </Button>
      </div>

      {food.suggestion ? (
        <p className="text-xs text-emerald-400">Proposé : {food.suggestion.productName}</p>
      ) : null}

      <Button variant="secondary" className="w-full" disabled={busy} onClick={onToujours}>
        Toujours là (ne pas inventorier)
      </Button>
    </Card>
  )
}
