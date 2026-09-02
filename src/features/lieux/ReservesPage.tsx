import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText } from '../../components/ui/Field'
import { useInventaire } from '../../hooks/useInventaire'
import { placeKindIcon, placeKindLabel, type Place } from '../../lib/types'
import { ReserveModal } from './ReserveModal'

export function ReservesPage() {
  const { places, lots, removePlace } = useInventaire()
  const [editing, setEditing] = useState<Place | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(place: Place) {
    if (!confirm(`Supprimer la réserve « ${place.name} » ?`)) return
    setError(null)
    try {
      await removePlace(place.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Réserves</h1>
        <Button onClick={() => setCreating(true)}>Nouvelle</Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {places.length === 0 ? (
        <Card className="text-center text-sm text-slate-400">
          Aucune réserve. Créez-en une : un congélateur, un placard, une cave.
        </Card>
      ) : null}

      {places.map((place) => {
        const count = lots.filter((lot) => lot.placeId === place.id).length
        return (
          <Card key={place.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium text-slate-100">
                  {placeKindIcon(place.kind)} {place.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {placeKindLabel(place.kind)} · {count} lot{count > 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/reserves/${place.id}`}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500"
                >
                  Ouvrir
                </Link>
                <Button variant="secondary" onClick={() => setEditing(place)}>
                  Modifier
                </Button>
                <Button variant="ghost" onClick={() => remove(place)} aria-label="Supprimer">
                  🗑
                </Button>
              </div>
            </div>
            <ul className="flex flex-wrap gap-2">
              {place.sections.length === 0 ? (
                <li className="text-xs text-slate-500">Pas de section.</li>
              ) : null}
              {place.sections.map((section) => {
                const inSection = lots.filter((lot) => lot.sectionId === section.id).length
                return (
                  <li key={section.id}>
                    <Link
                      to={`/ajouter?reserve=${place.id}&section=${section.id}`}
                      title={`Ranger dans « ${section.name} »`}
                      className="inline-block rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400 hover:border-emerald-600 hover:text-emerald-300"
                    >
                      {section.name}
                      <span className="ml-1.5 text-slate-600">{inSection}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}

      {creating ? <ReserveModal place={null} onClose={() => setCreating(false)} /> : null}
      {editing ? <ReserveModal place={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}
