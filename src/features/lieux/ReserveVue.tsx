import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useInventaire } from '../../hooks/useInventaire'
import { expiryLabel, expiryLevel } from '../../lib/dates'
import { placeKindIcon, type Lot } from '../../lib/types'
import { LotModal } from '../inventaire/LotModal'

/**
 * La réserve dessinée : ses sections empilées comme les tiroirs qu'elles sont.
 *
 * Un inventaire en liste répond à « où est le petit pois » ; ce dessin répond à
 * « qu'est-ce qu'il y a dans le tiroir du bas », qui est la question qu'on se
 * pose porte ouverte. D'où l'ordre vertical, respecté tel qu'il a été déclaré :
 * le haut en haut, le bas en bas. Et un bouton d'ajout par tiroir, parce qu'on
 * range là où l'on regarde.
 */
export function ReserveVue() {
  const { placeId } = useParams()
  const navigate = useNavigate()
  const { places, lots, productById, loading } = useInventaire()
  const [openLot, setOpenLot] = useState<Lot | null>(null)

  const place = places.find((p) => p.id === placeId)

  const tiroirs = useMemo(() => {
    if (!place) return []
    const dedans = lots.filter((l) => l.placeId === place.id)
    const parSection = [
      ...place.sections.map((s) => ({ id: s.id, name: s.name })),
      { id: null, name: 'Sans section' },
    ]
    return parSection
      .map((section) => ({
        ...section,
        lots: dedans
          .filter((l) => l.sectionId === section.id)
          .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999')),
      }))
      // Le rangement « sans section » n'apparaît que s'il contient quelque chose :
      // c'est un cas de repli, pas un tiroir.
      .filter((section) => section.id !== null || section.lots.length > 0)
  }, [lots, place])

  if (loading) return <p className="py-10 text-center text-slate-500">Chargement…</p>

  if (!place) {
    return (
      <Card className="text-center text-sm text-slate-400">
        Cette réserve n'existe plus. <Link to="/reserves" className="text-emerald-400">Retour</Link>
      </Card>
    )
  }

  const total = lots.filter((l) => l.placeId === place.id).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            {placeKindIcon(place.kind)} {place.name}
          </h1>
          <p className="text-xs text-slate-500">
            {total} lot{total > 1 ? 's' : ''} · {place.sections.length} section
            {place.sections.length > 1 ? 's' : ''}
          </p>
        </div>
        <Link
          to="/reserves"
          className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Retour
        </Link>
      </div>

      {/* Le meuble : une colonne de tiroirs, séparés par un trait, dans l'ordre
          où on les ouvre. Les épaisseurs sont fixes — un tiroir plein n'est pas
          plus haut qu'un tiroir vide, seule sa garniture change. */}
      <div className="overflow-hidden rounded-2xl border-2 border-slate-700 bg-slate-950">
        {tiroirs.map((tiroir, index) => (
          <section
            key={tiroir.id ?? 'sans'}
            className={`p-3 ${index > 0 ? 'border-t-2 border-slate-800' : ''}`}
          >
            <header className="mb-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {/* La poignée : ce petit trait suffit à faire lire l'ensemble
                    comme un meuble plutôt que comme une liste de plus. */}
                <span className="h-1 w-6 rounded-full bg-slate-600" aria-hidden />
                <span className="text-sm font-medium text-slate-200">{tiroir.name}</span>
                <span className="text-xs text-slate-500">{tiroir.lots.length}</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/ajouter?reserve=${place.id}${tiroir.id ? `&section=${tiroir.id}` : ''}`,
                  )
                }
                className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
              >
                + Ajouter ici
              </button>
            </header>

            {tiroir.lots.length === 0 ? (
              <p className="px-1 text-xs text-slate-600">vide</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {tiroir.lots.map((lot) => {
                  const product = productById(lot.productId)
                  const level = expiryLevel(lot.expiresAt)
                  return (
                    <li key={lot.id}>
                      <button
                        type="button"
                        onClick={() => setOpenLot(lot)}
                        title={lot.expiresAt ? expiryLabel(lot.expiresAt) : 'sans date'}
                        className={`max-w-full truncate rounded-lg border px-2 py-1 text-xs ${
                          level === 'perime' || level === 'urgent'
                            ? 'border-red-800 bg-red-950 text-red-200'
                            : level === 'bientot'
                              ? 'border-amber-900 bg-amber-950 text-amber-200'
                              : 'border-slate-700 bg-slate-900 text-slate-200'
                        }`}
                      >
                        {product?.name ?? 'Produit inconnu'}
                        <span className="ml-1 text-slate-500">
                          {lot.quantity}
                          {lot.unit || product?.unit ? ` ${lot.unit || product?.unit}` : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => navigate(`/ajouter?reserve=${place.id}`)}
        >
          Ajouter dans cette réserve
        </Button>
      </div>

      {openLot ? (
        <LotModal
          lot={lots.find((l) => l.id === openLot.id) ?? openLot}
          onClose={() => setOpenLot(null)}
        />
      ) : null}
    </div>
  )
}
