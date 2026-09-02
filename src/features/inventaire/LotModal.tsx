import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorText, Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { useInventaire } from '../../hooks/useInventaire'
import { expiryLabel, formatLong } from '../../lib/dates'
import type { Lot } from '../../lib/types'
import { LotForm, lotToDraft } from '../formulaires/LotForm'
import { ProduitForm, produitToDraft } from '../formulaires/ProduitForm'

type Mode = 'vue' | 'lot' | 'produit'

export function LotModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const { productById, placeById, sectionName, consumeLot, removeLot, saveLot, saveProduct } =
    useInventaire()
  const [mode, setMode] = useState<Mode>('vue')
  const [taking, setTaking] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const product = productById(lot.productId)
  const place = placeById(lot.placeId)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.')
      setBusy(false)
    }
  }

  if (!product) {
    return (
      <Modal title="Lot" onClose={onClose}>
        <p className="text-slate-400">Ce lot renvoie à un produit qui n'existe plus.</p>
      </Modal>
    )
  }

  if (mode === 'lot') {
    return (
      <Modal title="Modifier le rangement" onClose={onClose}>
        <LotForm
          product={product}
          initial={lotToDraft(lot)}
          submitLabel="Enregistrer"
          onCancel={() => setMode('vue')}
          onSubmit={async (draft) => {
            await saveLot(lot.id, draft)
            onClose()
          }}
        />
      </Modal>
    )
  }

  if (mode === 'produit') {
    return (
      <Modal title="Fiche produit" onClose={onClose}>
        <ProduitForm
          initial={produitToDraft(product)}
          submitLabel="Enregistrer"
          onCancel={() => setMode('vue')}
          onSubmit={async (draft) => {
            await saveProduct(product.id, draft)
            setMode('vue')
          }}
        />
      </Modal>
    )
  }

  return (
    <Modal title={product.name} onClose={onClose}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">Reste</dt>
          <dd className="text-right text-slate-100">
            {lot.quantity} {product.unit}
          </dd>
          <dt className="text-slate-500">Où</dt>
          <dd className="text-right text-slate-100">
            {place?.name ?? '—'} · {sectionName(lot.placeId, lot.sectionId)}
          </dd>
          <dt className="text-slate-500">Rangé le</dt>
          <dd className="text-right text-slate-100">{formatLong(lot.storedAt)}</dd>
          <dt className="text-slate-500">À consommer avant</dt>
          <dd className="text-right text-slate-100">
            {lot.expiresAt ? `${formatLong(lot.expiresAt)} (${expiryLabel(lot.expiresAt)})` : '—'}
          </dd>
          {lot.note ? (
            <>
              <dt className="text-slate-500">Note</dt>
              <dd className="text-right text-slate-100">{lot.note}</dd>
            </>
          ) : null}
          <dt className="text-slate-500">Posé par</dt>
          <dd className="text-right text-slate-400">{lot.addedBy}</dd>
        </dl>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <p className="mb-2 text-sm font-medium text-slate-300">J'en prends…</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0.001}
              max={lot.quantity}
              step="any"
              inputMode="decimal"
              className="text-center"
              value={taking}
              onChange={(e) => setTaking(Number(e.target.value))}
            />
            <Button
              disabled={busy || taking <= 0}
              onClick={() => run(() => consumeLot(lot.id, taking))}
            >
              Retirer
            </Button>
            {/* Prendre tout ce qui reste est le geste le plus fréquent : il ne doit
                pas demander de taper le bon nombre au préalable. */}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => consumeLot(lot.id, lot.quantity))}
            >
              Tout
            </Button>
          </div>
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setMode('lot')} disabled={busy}>
            Modifier
          </Button>
          <Button variant="secondary" onClick={() => setMode('produit')} disabled={busy}>
            Fiche produit
          </Button>
          <Button
            variant="danger"
            className="col-span-2"
            disabled={busy}
            onClick={() => {
              if (confirm('Retirer ce lot de l’inventaire ?')) void run(() => removeLot(lot.id))
            }}
          >
            Jeter / retirer le lot
          </Button>
        </div>
      </div>
    </Modal>
  )
}
