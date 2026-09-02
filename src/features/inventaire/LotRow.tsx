import { expiryLabel, expiryLevel, type ExpiryLevel } from '../../lib/dates'
import type { Lot, Product } from '../../lib/types'

const BADGE: Record<ExpiryLevel, string> = {
  perime: 'bg-red-950 text-red-300 border-red-800',
  urgent: 'bg-amber-950 text-amber-300 border-amber-800',
  bientot: 'bg-slate-800 text-slate-300 border-slate-700',
  ok: 'bg-slate-900 text-slate-500 border-slate-800',
  sans: 'bg-slate-900 text-slate-600 border-slate-800',
}

/** Une ligne d'inventaire : ce qu'on cherche à savoir en ouvrant un tiroir —
 *  quoi, combien, et pour combien de temps encore. */
export function LotRow({
  lot,
  product,
  location,
  onClick,
}: {
  lot: Lot
  product: Product | undefined
  location?: string
  onClick: () => void
}) {
  const level = expiryLevel(lot.expiresAt)

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800/70"
    >
      {product?.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded border border-slate-800 bg-slate-950 object-contain"
        />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-800 bg-slate-950 text-slate-600">
          🥫
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-slate-100">{product?.name ?? 'Produit inconnu'}</span>
        <span className="block truncate text-xs text-slate-500">
          {[product?.brand, location, lot.note].filter(Boolean).join(' · ')}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block font-medium text-slate-200">
          {lot.quantity} {product?.unit ?? ''}
        </span>
        <span className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-[0.65rem] ${BADGE[level]}`}>
          {expiryLabel(lot.expiresAt)}
        </span>
      </span>
    </button>
  )
}
