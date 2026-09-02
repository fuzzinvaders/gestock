import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { useInventaire } from '../../hooks/useInventaire'
import { expiryLevel, type ExpiryLevel } from '../../lib/dates'
import type { Lot } from '../../lib/types'
import { LotModal } from '../inventaire/LotModal'
import { LotRow } from '../inventaire/LotRow'

const BUCKETS: { level: ExpiryLevel; title: string; note: string }[] = [
  { level: 'perime', title: 'Périmés', note: 'À contrôler ou à jeter.' },
  { level: 'urgent', title: 'À manger tout de suite', note: 'Sous trois jours.' },
  { level: 'bientot', title: 'Bientôt', note: 'Dans le mois qui vient.' },
]

export function AlertesPage() {
  const { lots, loading, productById, placeById, sectionName } = useInventaire()
  const [openLot, setOpenLot] = useState<Lot | null>(null)

  const buckets = useMemo(() => {
    const sorted = [...lots].sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'))
    return BUCKETS.map((bucket) => ({
      ...bucket,
      lots: sorted.filter((lot) => expiryLevel(lot.expiresAt) === bucket.level),
    }))
  }, [lots])

  const nothing = buckets.every((bucket) => bucket.lots.length === 0)

  if (loading) {
    return <p className="py-10 text-center text-slate-500">Chargement…</p>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-100">Alertes</h1>

      {nothing ? (
        <Card className="text-center text-sm text-slate-400">
          Rien ne presse : aucune date de péremption dans les trente jours.
        </Card>
      ) : null}

      {buckets
        .filter((bucket) => bucket.lots.length > 0)
        .map((bucket) => (
          <section key={bucket.level} className="space-y-2">
            <h2 className="flex items-baseline justify-between px-1">
              <span className="text-sm font-semibold tracking-wide text-slate-300 uppercase">
                {bucket.title}
              </span>
              <span className="text-xs text-slate-500">{bucket.note}</span>
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <ul className="divide-y divide-slate-800">
                {bucket.lots.map((lot) => (
                  <li key={lot.id}>
                    <LotRow
                      lot={lot}
                      product={productById(lot.productId)}
                      // Sur cette page, savoir où aller chercher compte autant que
                      // le produit lui-même : l'emplacement s'affiche avec lui.
                      location={`${placeById(lot.placeId)?.name ?? '—'} · ${sectionName(lot.placeId, lot.sectionId)}`}
                      onClick={() => setOpenLot(lot)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}

      {openLot ? (
        <LotModal
          lot={lots.find((l) => l.id === openLot.id) ?? openLot}
          onClose={() => setOpenLot(null)}
        />
      ) : null}
    </div>
  )
}
