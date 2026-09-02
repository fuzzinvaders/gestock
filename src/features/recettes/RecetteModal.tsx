import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { expiryLabel } from '../../lib/dates'
import type { RecipeCross } from '../../lib/types'

/**
 * Le détail d'une recette : ligne par ligne, ce qu'on a et ce qu'il faut acheter.
 *
 * C'est l'écran qui justifie tout le reste — celui qu'on ouvre avant de partir
 * faire les courses, pour ne pas racheter les épinards qui dorment au congélateur.
 */
export function RecetteModal({ recette, onClose }: { recette: RecipeCross; onClose: () => void }) {
  const [copie, setCopie] = useState<'non' | 'oui' | 'echec'>('non')

  const enStock = recette.ingredients.filter((i) => i.status === 'stock')
  const toujours = recette.ingredients.filter((i) => i.status === 'toujours')
  const aAcheter = recette.ingredients.filter((i) => i.status === 'manque')
  const inconnus = recette.ingredients.filter((i) => i.status === 'inconnu')

  async function copierListe() {
    const liste = [...aAcheter, ...inconnus].map((i) => i.name).join('\n')
    try {
      await navigator.clipboard.writeText(liste)
      setCopie('oui')
    } catch {
      // Le presse-papier est refusé hors contexte sécurisé, et sur certains
      // navigateurs mobiles quand le geste n'est pas jugé direct.
      setCopie('echec')
    }
  }

  return (
    <Modal title={recette.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-400">
            {[recette.totalTime, recette.servings ? `${recette.servings} parts` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="text-slate-300">
            {recette.haveCount}/{recette.ingredients.length} en stock
          </span>
        </div>

        {enStock.length > 0 ? (
          <Section titre="Vous avez déjà" ton="text-emerald-300">
            {enStock.map((i) => (
              <Ligne key={i.foodId} marque="✓" ton="text-emerald-400">
                <span className="text-slate-100">{i.name}</span>
                <span className="block text-xs text-slate-500">
                  {[
                    i.productName,
                    i.placeName,
                    i.quantity !== undefined ? `${i.quantity} ${i.unit ?? ''}`.trim() : null,
                    i.expiresAt ? expiryLabel(i.expiresAt) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Ligne>
            ))}
          </Section>
        ) : null}

        {toujours.length > 0 ? (
          <Section titre="Fond de placard" ton="text-slate-400">
            <p className="px-1 text-sm text-slate-400">{toujours.map((i) => i.name).join(', ')}</p>
          </Section>
        ) : null}

        {aAcheter.length > 0 ? (
          <Section titre="À acheter" ton="text-amber-300">
            {aAcheter.map((i) => (
              <Ligne key={i.foodId} marque="✗" ton="text-amber-400">
                <span className="text-slate-100">{i.name}</span>
              </Ligne>
            ))}
          </Section>
        ) : null}

        {inconnus.length > 0 ? (
          <Section titre="Non reliés" ton="text-slate-400">
            {inconnus.map((i) => (
              <Ligne key={i.foodId} marque="?" ton="text-slate-500">
                <span className="text-slate-300">{i.name}</span>
              </Ligne>
            ))}
            <p className="px-1 text-xs text-slate-500">
              Ces aliments n'ont pas encore de produit associé : Gestock ne sait pas si vous les
              avez. Reliez-les dans Correspondances pour qu'ils cessent d'encombrer la liste.
            </p>
          </Section>
        ) : null}

        {recette.freeText > 0 ? (
          <p className="rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-500">
            {recette.freeText} ligne(s) d'ingrédients sont en texte libre dans Mealie : elles ne
            sont pas vérifiées ici. À contrôler sur la recette avant de partir.
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={copierListe}
            disabled={aAcheter.length + inconnus.length === 0}
          >
            {copie === 'oui'
              ? 'Copié'
              : copie === 'echec'
                ? 'Copie refusée'
                : `Copier la liste (${aAcheter.length + inconnus.length})`}
          </Button>
          <a
            href={recette.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-center font-medium text-white hover:bg-emerald-500"
          >
            Ouvrir dans Mealie
          </a>
        </div>
      </div>
    </Modal>
  )
}

function Section({
  titre,
  ton,
  children,
}: {
  titre: string
  ton: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-1">
      <h3 className={`px-1 text-xs font-semibold tracking-wide uppercase ${ton}`}>{titre}</h3>
      {children}
    </section>
  )
}

function Ligne({
  marque,
  ton,
  children,
}: {
  marque: string
  ton: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-2 px-1 py-0.5">
      <span className={`shrink-0 ${ton}`}>{marque}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
