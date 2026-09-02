import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorText, Field, Input, Select } from '../../components/ui/Field'
import { UNITS, type Product } from '../../lib/types'

export interface ProduitDraft {
  name: string
  brand: string
  category: string
  unit: string
  ean: string | null
  shelfLifeDays: number | null
  imageUrl: string | null
}

export function emptyProduit(ean: string | null = null): ProduitDraft {
  return { name: '', brand: '', category: '', unit: 'pièce', ean, shelfLifeDays: null, imageUrl: null }
}

export function produitToDraft(product: Product): ProduitDraft {
  return {
    name: product.name,
    brand: product.brand,
    category: product.category,
    unit: product.unit,
    ean: product.ean,
    shelfLifeDays: product.shelfLifeDays,
    imageUrl: product.imageUrl,
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
