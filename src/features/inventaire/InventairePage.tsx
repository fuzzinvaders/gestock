import { useMemo, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Field'
import { useInventaire } from '../../hooks/useInventaire'
import { placeKindIcon, type Lot, type Place } from '../../lib/types'
import { LotModal } from './LotModal'
import { LotRow } from './LotRow'

/** Ce qui périme en premier se voit en premier ; ce qui n'a pas de date ferme la
 *  marche, faute de raison de le remonter. */
function byExpiry(a: Lot, b: Lot): number {
  if (a.expiresAt && b.expiresAt) return a.expiresAt.localeCompare(b.expiresAt)
  if (a.expiresAt) return -1
  if (b.expiresAt) return 1
  return a.storedAt.localeCompare(b.storedAt)
}

export function InventairePage() {
  const { places, products, lots, loading, productById } = useInventaire()
  const [search, setSearch] = useState('')
  const [placeId, setPlaceId] = useState<string | null>(null)
  const [openLot, setOpenLot] = useState<Lot | null>(null)

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return lots.filter((lot) => {
      if (placeId && lot.placeId !== placeId) return false
      if (!needle) return true
      const product = products.find((p) => p.id === lot.productId)
      return (
        (product?.name.toLowerCase().includes(needle) ?? false) ||
        (product?.brand.toLowerCase().includes(needle) ?? false) ||
        (product?.category.toLowerCase().includes(needle) ?? false) ||
        lot.note.toLowerCase().includes(needle)
      )
    })
  }, [lots, placeId, products, search])

  /* Regroupement réserve → section, dans l'ordre où les réserves ont été créées :
     c'est l'ordre dans lequel on en a parlé, donc celui qu'on a en tête. */
  const groups = useMemo(() => {
    return places
      .map((place: Place) => {
        const inPlace = visible.filter((lot) => lot.placeId === place.id)
        const sections = [
          ...place.sections.map((section) => ({
            key: section.id,
            name: section.name,
            lots: inPlace.filter((lot) => lot.sectionId === section.id).sort(byExpiry),
          })),
          {
            key: 'sans',
            name: 'Sans section',
            lots: inPlace.filter((lot) => !lot.sectionId).sort(byExpiry),
          },
        ].filter((section) => section.lots.length > 0)
        return { place, sections, count: inPlace.length }
      })
      .filter((group) => group.count > 0)
  }, [places, visible])

  if (loading) {
    return <p className="py-10 text-center text-slate-500">Chargement…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Inventaire</h1>
        <span className="text-sm text-slate-500">
          {visible.length} lot{visible.length > 1 ? 's' : ''}
        </span>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un produit, une marque, une note…"
      />

      <div className="flex flex-wrap gap-2">
        <FilterChip active={placeId === null} onClick={() => setPlaceId(null)}>
          Tout
        </FilterChip>
        {places.map((place) => (
          <FilterChip
            key={place.id}
            active={placeId === place.id}
            onClick={() => setPlaceId(place.id === placeId ? null : place.id)}
          >
            {placeKindIcon(place.kind)} {place.name}
          </FilterChip>
        ))}
      </div>

      {groups.length === 0 ? (
        <Card className="text-center text-sm text-slate-400">
          {lots.length === 0
            ? "Rien de rangé pour l'instant. L'onglet Ajouter attend votre premier scan."
            : 'Aucun lot ne correspond à cette recherche.'}
        </Card>
      ) : null}

      {groups.map(({ place, sections, count }) => (
        <section key={place.id} className="space-y-2">
          <h2 className="flex items-baseline justify-between px-1 text-sm font-semibold tracking-wide text-slate-400 uppercase">
            <span>
              {placeKindIcon(place.kind)} {place.name}
            </span>
            <span className="text-xs normal-case">{count}</span>
          </h2>
          {sections.map((section) => (
            <div
              key={section.key}
              className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
            >
              <div className="border-b border-slate-800 px-3 py-1.5 text-xs text-slate-500">
                {section.name}
              </div>
              <ul className="divide-y divide-slate-800">
                {section.lots.map((lot) => (
                  <li key={lot.id}>
                    <LotRow
                      lot={lot}
                      product={productById(lot.productId)}
                      onClick={() => setOpenLot(lot)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {openLot ? (
        // Le lot est relu dans la liste à chaque rendu : après un retrait, la
        // fenêtre doit montrer la quantité qui reste, pas celle d'avant.
        <LotModal
          lot={lots.find((l) => l.id === openLot.id) ?? openLot}
          onClose={() => setOpenLot(null)}
        />
      ) : null}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
          : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
