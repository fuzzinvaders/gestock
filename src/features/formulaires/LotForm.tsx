import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorText, Field, Input, Select } from '../../components/ui/Field'
import { useInventaire } from '../../hooks/useInventaire'
import { addDays, todayIso } from '../../lib/dates'
import type { Lot, Product } from '../../lib/types'

export interface LotDraft {
  placeId: string
  sectionId: string | null
  quantity: number
  storedAt: string
  expiresAt: string | null
  note: string
}

/** Raccourcis de péremption : ce sont les durées que l'on annonce à voix haute
 *  devant un congélateur, plutôt qu'une date que l'on calcule. */
const SHORTCUTS = [
  { label: '+1 sem.', days: 7 },
  { label: '+1 mois', days: 30 },
  { label: '+3 mois', days: 90 },
  { label: '+6 mois', days: 182 },
  { label: '+1 an', days: 365 },
]

export function emptyLot(product: Product, placeId: string): LotDraft {
  const storedAt = todayIso()
  return {
    placeId,
    sectionId: null,
    quantity: 1,
    storedAt,
    // La durée de conservation de la fiche produit devient une date concrète : on
    // corrige une date proposée bien plus volontiers qu'on ne remplit un champ vide.
    expiresAt: product.shelfLifeDays ? addDays(storedAt, product.shelfLifeDays) : null,
    note: '',
  }
}

export function lotToDraft(lot: Lot): LotDraft {
  return {
    placeId: lot.placeId,
    sectionId: lot.sectionId,
    quantity: lot.quantity,
    storedAt: lot.storedAt,
    expiresAt: lot.expiresAt,
    note: lot.note,
  }
}

export function LotForm({
  product,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  product: Product
  initial: LotDraft
  submitLabel: string
  onSubmit: (draft: LotDraft) => Promise<void>
  onCancel?: () => void
}) {
  const { places } = useInventaire()
  const [draft, setDraft] = useState<LotDraft>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const place = places.find((p) => p.id === draft.placeId)

  function set<K extends keyof LotDraft>(key: K, value: LotDraft[K]) {
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
      <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
        <div className="font-medium text-slate-100">{product.name}</div>
        {product.brand ? <div className="text-sm text-slate-400">{product.brand}</div> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Réserve">
          <Select
            value={draft.placeId}
            onChange={(e) => setDraft((d) => ({ ...d, placeId: e.target.value, sectionId: null }))}
            required
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Section">
          <Select
            value={draft.sectionId ?? ''}
            onChange={(e) => set('sectionId', e.target.value === '' ? null : e.target.value)}
          >
            <option value="">Sans section</option>
            {place?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={`Quantité (${product.unit})`}>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => set('quantity', Math.max(0.001, Math.round((draft.quantity - 1) * 1000) / 1000))}
            aria-label="Retirer un"
          >
            −
          </Button>
          <Input
            type="number"
            min={0.001}
            step="any"
            inputMode="decimal"
            className="text-center"
            value={draft.quantity}
            onChange={(e) => set('quantity', Number(e.target.value))}
            required
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => set('quantity', Math.round((draft.quantity + 1) * 1000) / 1000)}
            aria-label="Ajouter un"
          >
            +
          </Button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Rangé le">
          <Input
            type="date"
            value={draft.storedAt}
            onChange={(e) => set('storedAt', e.target.value)}
            required
          />
        </Field>
        <Field label="À consommer avant">
          <Input
            type="date"
            value={draft.expiresAt ?? ''}
            onChange={(e) => set('expiresAt', e.target.value === '' ? null : e.target.value)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map((shortcut) => (
          <button
            key={shortcut.days}
            type="button"
            onClick={() => set('expiresAt', addDays(draft.storedAt, shortcut.days))}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
          >
            {shortcut.label}
          </button>
        ))}
        {draft.expiresAt ? (
          <button
            type="button"
            onClick={() => set('expiresAt', null)}
            className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-500 hover:text-slate-300"
          >
            sans date
          </button>
        ) : null}
      </div>

      <Field label="Note">
        <Input
          value={draft.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Entamé, offert, pour la recette du dimanche…"
        />
      </Field>

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} className="flex-1">
            Annuler
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={busy || places.length === 0}>
          {busy ? 'Enregistrement…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
