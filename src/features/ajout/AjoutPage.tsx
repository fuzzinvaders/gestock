import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Field, Input } from '../../components/ui/Field'
import { useInventaire } from '../../hooks/useInventaire'
import { api, messageOf } from '../../lib/api'
import type { LookupResult, Product } from '../../lib/types'
import { emptyLot, LotForm } from '../formulaires/LotForm'
import { emptyProduit, ProduitForm, type ProduitDraft } from '../formulaires/ProduitForm'
import { Scanner } from './Scanner'

/* La dernière réserve utilisée est proposée par défaut : on range rarement une
   course dans un endroit différent à chaque article. Le choix reste sur le
   téléphone qui l'a fait — chacun range plutôt de son côté. */
const LAST_PLACE_KEY = 'gestock:derniere-reserve'

function rememberPlace(placeId: string) {
  try {
    localStorage.setItem(LAST_PLACE_KEY, placeId)
  } catch {
    // Mode privé ou stockage plein : ce n'est qu'un confort, on s'en passe.
  }
}

function recalledPlace(): string | null {
  try {
    return localStorage.getItem(LAST_PLACE_KEY)
  } catch {
    return null
  }
}

type Step =
  | { kind: 'debut' }
  | { kind: 'produit'; draft: ProduitDraft; hint: string | null }
  | { kind: 'lot'; product: Product }

export function AjoutPage() {
  const { places, products, saveProduct, saveLot, saveLink } = useInventaire()
  /* Où ranger, quand on arrive depuis une réserve : « ajouter ici » vise le
     tiroir qu'on a sous les yeux, plutôt que de rouvrir un menu déroulant
     debout devant le congélateur ouvert. */
  const [params] = useSearchParams()
  const reserveVisee = params.get('reserve')
  const sectionVisee = params.get('section')
  const [step, setStep] = useState<Step>({ kind: 'debut' })
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const defaultPlaceId = useMemo(() => {
    if (reserveVisee && places.some((p) => p.id === reserveVisee)) return reserveVisee
    const recalled = recalledPlace()
    if (recalled && places.some((p) => p.id === recalled)) return recalled
    return places[0]?.id ?? ''
  }, [places, reserveVisee])

  const defaultSectionId = useMemo(() => {
    const place = places.find((p) => p.id === defaultPlaceId)
    return place?.sections.some((s) => s.id === sectionVisee) ? sectionVisee : null
  }, [defaultPlaceId, places, sectionVisee])

  const reserveNommee = places.find((p) => p.id === reserveVisee)
  const sectionNommee = reserveNommee?.sections.find((s) => s.id === sectionVisee)

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (needle.length < 2) return []
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.brand.toLowerCase().includes(needle) ||
          (p.ean ?? '').includes(needle),
      )
      .slice(0, 8)
  }, [products, search])

  async function handleCode(rawCode: string) {
    const ean = rawCode.trim()
    setScanning(false)
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await api.get<LookupResult>(`/api/lookup?ean=${encodeURIComponent(ean)}`)
      // Un produit déjà connu du foyer saute l'étape de la fiche : on ne redécrit
      // pas le paquet de riz à chaque fois qu'on en range un.
      if (result.source === 'gestock' && result.product?.id) {
        const known = products.find((p) => p.id === result.product?.id)
        if (known) {
          setStep({ kind: 'lot', product: known })
          return
        }
      }
      if (result.found && result.product) {
        setStep({
          kind: 'produit',
          draft: {
            ...emptyProduit(ean),
            name: result.product.name,
            brand: result.product.brand,
            category: result.product.category,
            imageUrl: result.product.imageUrl,
          },
          hint: 'Fiche proposée par Open Food Facts — corrigez ce qui ne va pas.',
        })
        return
      }
      setStep({
        kind: 'produit',
        draft: emptyProduit(ean),
        hint:
          result.source === 'hors-ligne'
            ? "Open Food Facts est injoignable : saisissez le produit à la main, le code est conservé."
            : "Code inconnu d'Open Food Facts : à vous de le décrire, une seule fois.",
      })
    } catch (err) {
      setError(messageOf(err, 'Recherche impossible.'))
    } finally {
      setBusy(false)
    }
  }

  async function createProduct(draft: ProduitDraft) {
    const product = await saveProduct(null, draft)
    // La correspondance Mealie se pose au moment où l'on décrit le produit :
    // c'est là qu'on a son nom en tête, pas dans un écran de réglages plus tard.
    if (draft.mealieFoodId) {
      await saveLink(draft.mealieFoodId, {
        foodName: draft.mealieFoodName || product.name,
        productId: product.id,
        always: false,
      })
    }
    setStep({ kind: 'lot', product })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-100">
        {reserveNommee
          ? `Ajouter dans ${reserveNommee.name}${sectionNommee ? ` · ${sectionNommee.name}` : ''}`
          : 'Ajouter'}
      </h1>

      {places.length === 0 ? (
        <Card className="text-sm text-slate-400">
          Créez d'abord une réserve dans l'onglet <strong className="text-slate-200">Réserves</strong>.
        </Card>
      ) : null}

      {done ? (
        <div className="rounded-lg bg-emerald-950/60 px-3 py-2 text-sm text-emerald-300">{done}</div>
      ) : null}
      <ErrorText>{error}</ErrorText>

      {step.kind === 'debut' ? (
        <>
          <Card className="space-y-3">
            {scanning ? (
              <Scanner onDetected={handleCode} onClose={() => setScanning(false)} />
            ) : (
              <Button
                onClick={() => {
                  setScanning(true)
                  setError(null)
                  setDone(null)
                }}
                className="w-full py-4 text-lg"
                disabled={busy || places.length === 0}
              >
                📷 Scanner un code-barres
              </Button>
            )}
            {busy ? <p className="text-center text-sm text-slate-400">Recherche du produit…</p> : null}

            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (manualCode.trim()) void handleCode(manualCode)
                setManualCode('')
              }}
            >
              <div className="flex-1">
                <Field label="Ou taper le code">
                  <Input
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="3017620422003"
                  />
                </Field>
              </div>
              <Button type="submit" variant="secondary" disabled={busy}>
                Chercher
              </Button>
            </form>
          </Card>

          <Card className="space-y-3">
            <Field label="Un produit déjà connu" hint="Fruits, plats maison, vrac : tout ce qui n'a pas de code.">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher dans vos produits…"
              />
            </Field>
            {matches.length > 0 ? (
              <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
                {matches.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setStep({ kind: 'lot', product })
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800"
                    >
                      <span className="text-slate-100">{product.name}</span>
                      {product.brand ? (
                        <span className="ml-2 text-sm text-slate-500">{product.brand}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button
              variant="secondary"
              className="w-full"
              disabled={places.length === 0}
              onClick={() =>
                setStep({ kind: 'produit', draft: emptyProduit(null), hint: null })
              }
            >
              Nouveau produit sans code-barres
            </Button>
          </Card>
        </>
      ) : null}

      {step.kind === 'produit' ? (
        <Card className="space-y-3">
          {step.hint ? <p className="text-sm text-slate-400">{step.hint}</p> : null}
          <ProduitForm
            initial={step.draft}
            submitLabel="Continuer"
            onSubmit={createProduct}
            onCancel={() => setStep({ kind: 'debut' })}
          />
        </Card>
      ) : null}

      {step.kind === 'lot' ? (
        <Card>
          <LotForm
            product={step.product}
            initial={emptyLot(step.product, defaultPlaceId, defaultSectionId)}
            submitLabel="Ranger"
            onCancel={() => setStep({ kind: 'debut' })}
            onSubmit={async (draft) => {
              await saveLot(null, { ...draft, productId: step.product.id })
              rememberPlace(draft.placeId)
              setDone(`${step.product.name} rangé.`)
              // On revient au départ plutôt qu'à l'inventaire : ranger des courses,
              // c'est une dizaine d'articles à la suite.
              setStep({ kind: 'debut' })
            }}
          />
        </Card>
      ) : null}
    </div>
  )
}
