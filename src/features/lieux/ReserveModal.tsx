import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorText, Field, Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useInventaire } from '../../hooks/useInventaire'
import { PLACE_KINDS, type Place, type PlaceKind } from '../../lib/types'

interface SectionDraft {
  id?: string
  name: string
}

export function ReserveModal({ place, onClose }: { place: Place | null; onClose: () => void }) {
  const { savePlace } = useInventaire()
  const [name, setName] = useState(place?.name ?? '')
  const [kind, setKind] = useState<PlaceKind>(place?.kind ?? 'placard')
  const [sections, setSections] = useState<SectionDraft[]>(
    place?.sections.map((s) => ({ id: s.id, name: s.name })) ?? [{ name: 'Étage 1' }],
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function setSection(index: number, value: string) {
    setSections((list) => list.map((s, i) => (i === index ? { ...s, name: value } : s)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await savePlace(place?.id ?? null, {
        name,
        kind,
        // Les lignes laissées vides sont des sections que l'on vient de retirer :
        // inutile de les faire refuser par le serveur.
        sections: sections
          .filter((s) => s.name.trim() !== '')
          .map((s) => ({ id: s.id, name: s.name }) as { id: string; name: string }),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible.')
      setBusy(false)
    }
  }

  return (
    <Modal title={place ? 'Modifier la réserve' : 'Nouvelle réserve'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom">
          <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>

        <Field label="Type">
          <Select value={kind} onChange={(e) => setKind(e.target.value as PlaceKind)}>
            {PLACE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.icon} {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-300">
            Étages, tiroirs, bacs
          </span>
          <div className="space-y-2">
            {sections.map((section, index) => (
              <div key={section.id ?? `nouvelle-${index}`} className="flex gap-2">
                <Input
                  value={section.name}
                  onChange={(e) => setSection(index, e.target.value)}
                  placeholder={`Section ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Retirer la section"
                  onClick={() => setSections((list) => list.filter((_, i) => i !== index))}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSections((list) => [...list, { name: '' }])}
            className="mt-2 text-sm text-emerald-400 hover:text-emerald-300"
          >
            + Ajouter une section
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Retirer une section ne supprime rien : les lots qui s'y trouvaient remontent dans la
            réserve, sans section.
          </p>
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
