import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { expiryLabel } from '../../lib/dates'
import type { RecipeCross, RecipeIngredient } from '../../lib/types'

/** « 500 g », « 1,5 kg », « 2 » — la quantité telle qu'on l'écrirait à la main. */
function quantite(q: number | undefined, unite: string | undefined | null): string {
  if (q === undefined || !Number.isFinite(q)) return ''
  const nombre = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100).replace('.', ',')
  const u = String(unite ?? '').trim()
  return u ? `${nombre} ${u}` : nombre
}

/** Ce que la recette réclame, à côté du nom de l'ingrédient. */
function Besoin({ ingredient }: { ingredient: RecipeIngredient }) {
  if (!ingredient.besoin) return null
  return (
    <span className="ml-2 text-slate-500">
      — {quantite(ingredient.besoin.quantity, ingredient.besoin.unit)}
    </span>
  )
}

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

  /* Ce qu'il manque, tel qu'on le lira en rayon : « 2 avocats » se choisit mieux
     qu'« avocat ». Les ingrédients dont on n'a qu'une partie y figurent aussi,
     avec le complément à acheter — sans quoi la liste dirait qu'on est couvert. */
  const partiels = enStock.filter((i) => i.assez === false)

  async function copierListe() {
    const liste = [...aAcheter, ...inconnus, ...partiels]
      .map((i) => {
        if (i.assez === false && i.manque) {
          return `${i.name} — il en manque ${quantite(i.manque, i.besoin?.unit)}`
        }
        const besoin = i.besoin ? quantite(i.besoin.quantity, i.besoin.unit) : ''
        return besoin ? `${i.name} — ${besoin}` : i.name
      })
      .join('\n')
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
              <Ligne
                key={i.foodId}
                marque={i.assez === false ? '≈' : '✓'}
                ton={i.assez === false ? 'text-amber-400' : 'text-emerald-400'}
              >
                <span className="text-slate-100">{i.name}</span>
                <Besoin ingredient={i} />
                <span className="block text-xs text-slate-500">
                  {[
                    i.productName,
                    i.placeName,
                    quantite(i.quantity, i.unit) || null,
                    i.expiresAt ? expiryLabel(i.expiresAt) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {/* Le verdict n'apparaît que s'il a été rendu. Et quand il ne l'a
                    pas été, il faut le dire : un ✓ muet devant « 2 cuillère à
                    soupe » se lit « vous en avez assez », alors qu'il ne veut dire
                    que « vous en avez ». La nuance décide d'un aller au magasin. */}
                {i.assez === false && i.manque ? (
                  <span className="block text-xs text-amber-400">
                    il en manque {quantite(i.manque, i.besoin?.unit)}
                  </span>
                ) : i.besoin && i.assez === null ? (
                  <span className="block text-xs text-slate-500">
                    quantité non comparable — à vérifier vous-même
                  </span>
                ) : null}
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
                <Besoin ingredient={i} />
              </Ligne>
            ))}
          </Section>
        ) : null}

        {inconnus.length > 0 ? (
          <Section titre="Non reliés" ton="text-slate-400">
            {inconnus.map((i) => (
              <Ligne key={i.foodId} marque="?" ton="text-slate-500">
                <span className="text-slate-300">{i.name}</span>
                <Besoin ingredient={i} />
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
            disabled={aAcheter.length + inconnus.length + partiels.length === 0}
          >
            {copie === 'oui'
              ? 'Copié'
              : copie === 'echec'
                ? 'Copie refusée'
                : `Copier la liste (${aAcheter.length + inconnus.length + partiels.length})`}
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
