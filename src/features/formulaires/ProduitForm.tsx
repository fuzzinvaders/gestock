import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorText, Field, Input, Select } from '../../components/ui/Field'
import { useInventaire } from '../../hooks/useInventaire'
import { api } from '../../lib/api'
import { UNITS, type PendingFood, type Product } from '../../lib/types'

export interface ProduitDraft {
  name: string
  brand: string
  category: string
  unit: string
  ean: string | null
  shelfLifeDays: number | null
  imageUrl: string | null
  /** Ingrédient Mealie que ce produit couvre, choisi à la saisie. */
  mealieFoodId: string | null
  mealieFoodName: string
}

export function emptyProduit(ean: string | null = null): ProduitDraft {
  return {
    name: '',
    brand: '',
    category: '',
    unit: 'pièce',
    ean,
    shelfLifeDays: null,
    imageUrl: null,
    mealieFoodId: null,
    mealieFoodName: '',
  }
}

export function produitToDraft(
  product: Product,
  lien?: { foodId: string; foodName: string } | null,
): ProduitDraft {
  return {
    name: product.name,
    brand: product.brand,
    category: product.category,
    unit: product.unit,
    ean: product.ean,
    shelfLifeDays: product.shelfLifeDays,
    imageUrl: product.imageUrl,
    mealieFoodId: lien?.foodId ?? null,
    mealieFoodName: lien?.foodName ?? '',
  }
}

/** La fiche du produit en général — pas de l'exemplaire rangé quelque part. */
export function ProduitForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ProduitDraft
  submitLabel: string
  onSubmit: (draft: ProduitDraft) => Promise<void>
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState<ProduitDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof ProduitDraft>(key: K, value: ProduitDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(draft)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {draft.imageUrl ? (
        <img
          src={draft.imageUrl}
          alt=""
          className="mx-auto h-24 w-24 rounded-lg border border-slate-800 bg-slate-950 object-contain"
        />
      ) : null}

      <Field label="Nom">
        <Input value={draft.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Marque">
          <Input value={draft.brand} onChange={(e) => set('brand', e.target.value)} />
        </Field>
        <Field label="Rayon">
          <Input
            value={draft.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Surgelés, Épicerie…"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Unité">
          <Select value={draft.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Conservation" hint="En jours, pour proposer une péremption.">
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={draft.shelfLifeDays ?? ''}
            onChange={(e) =>
              set('shelfLifeDays', e.target.value === '' ? null : Number(e.target.value))
            }
            placeholder="ex. 180"
          />
        </Field>
      </div>

      <IngredientMealie
        foodId={draft.mealieFoodId}
        foodName={draft.mealieFoodName}
        nomProduit={draft.name}
        onChoisir={(food) => {
          set('mealieFoodId', food?.foodId ?? null)
          set('mealieFoodName', food?.foodName ?? '')
        }}
      />

      <Field label="Code-barres" hint="Vide pour ce qui se vend en vrac ou se cuisine.">
        <Input
          value={draft.ean ?? ''}
          inputMode="numeric"
          onChange={(e) => set('ean', e.target.value.trim() === '' ? null : e.target.value.trim())}
        />
      </Field>

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
            Annuler
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={busy}>
          {busy ? 'Enregistrement…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

/**
 * Le rattachement à un ingrédient du carnet de recettes, proposé pendant la
 * saisie du produit.
 *
 * C'est le bon moment : on vient d'écrire « Pois chiches en conserve 400 g », le
 * mot est en tête, et la recherche part de ce nom-là. Le faire ici évite d'avoir
 * à repasser plus tard par l'écran des correspondances pour un produit qu'on
 * venait justement de décrire.
 */
function IngredientMealie({
  foodId,
  foodName,
  nomProduit,
  onChoisir,
}: {
  foodId: string | null
  foodName: string
  nomProduit: string
  onChoisir: (food: { foodId: string; foodName: string } | null) => void
}) {
  const { mealie } = useInventaire()
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState<PendingFood[]>([])
  const [cherche, setCherche] = useState(false)

  useEffect(() => {
    const terme = recherche.trim()
    if (terme.length < 2) {
      setResultats([])
      return
    }
    // La recherche part chez Mealie : on attend une pause dans la frappe.
    const timer = setTimeout(async () => {
      setCherche(true)
      try {
        const res = await api.get<{ foods: PendingFood[] }>(
          `/api/mealie/aliments?q=${encodeURIComponent(terme)}`,
        )
        setResultats(res.foods.slice(0, 6))
      } catch {
        setResultats([])
      } finally {
        setCherche(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [recherche])

  if (!mealie?.configured) return null

  if (foodId) {
    return (
      <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2">
        <span className="block text-xs text-emerald-400">Ingrédient Mealie</span>
        <span className="flex items-center justify-between gap-3">
          <span className="text-slate-100">{foodName}</span>
          <button
            type="button"
            onClick={() => onChoisir(null)}
            className="text-sm text-slate-400 hover:text-red-400"
          >
            délier
          </button>
        </span>
      </div>
    )
  }

  return (
    <Field
      label="Ingrédient Mealie"
      hint="Facultatif — permet de savoir, devant une recette, que vous avez déjà ce produit."
    >
      <div className="flex gap-2">
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un ingrédient…"
        />
        {nomProduit.trim().length >= 2 && recherche === '' ? (
          <Button type="button" variant="secondary" onClick={() => setRecherche(nomProduit)}>
            Depuis le nom
          </Button>
        ) : null}
      </div>
      {cherche ? <p className="mt-1 text-xs text-slate-500">Recherche…</p> : null}
      {resultats.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {resultats.map((food) => (
            <li key={food.foodId}>
              <button
                type="button"
                onClick={() => {
                  onChoisir({ foodId: food.foodId, foodName: food.foodName })
                  setRecherche('')
                }}
                className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
              >
                {food.foodName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Field>
  )
}
