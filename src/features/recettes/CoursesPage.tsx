import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Select } from '../../components/ui/Field'
import { api, messageOf } from '../../lib/api'
import { expiryLabel, todayIso } from '../../lib/dates'
import type { ShoppingLine, ShoppingListCross, ShoppingListSummary } from '../../lib/types'

/* Le choix de liste reste sur le téléphone : on rouvre d'ordinaire celle de la
   semaine, pas une autre. */
const LISTE_KEY = 'gestock:liste-courses'

function rappelerListe(): string | null {
  try {
    return localStorage.getItem(LISTE_KEY)
  } catch {
    return null
  }
}

function retenirListe(id: string) {
  try {
    localStorage.setItem(LISTE_KEY, id)
  } catch {
    // Mode privé ou stockage plein : ce n'est qu'un confort.
  }
}

/** « 500 g », « 1,5 kg », « 2 » — la quantité telle qu'on l'écrirait à la main. */
function quantite(q: number | undefined, unite: string | undefined | null): string {
  if (q === undefined || !Number.isFinite(q)) return ''
  const nombre = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100).replace('.', ',')
  const u = String(unite ?? '').trim()
  return u ? `${nombre} ${u}` : nombre
}

/** Le texte de la ligne tel que Mealie l'écrit, à défaut le nom de l'aliment. */
function libelle(ligne: ShoppingLine): string {
  return ligne.display || ligne.name
}

/**
 * Une liste de courses de Mealie, relue à travers les placards.
 *
 * Mealie additionne les recettes de la semaine en une liste ; il ignore ce qui
 * dort au congélateur. Cet écran reprend sa liste telle quelle et la trie en ce
 * qu'il reste vraiment à acheter et ce qu'on a déjà — avec l'endroit où le
 * trouver, pour ne pas le racheter par oubli.
 *
 * Rien n'est écrit dans Mealie : la liste reste la sienne, cochée là-bas.
 */
export function CoursesPage() {
  const [listes, setListes] = useState<ShoppingListSummary[] | null>(null)
  const [choisie, setChoisie] = useState<string | null>(null)
  const [liste, setListe] = useState<ShoppingListCross | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copie, setCopie] = useState<'non' | 'oui' | 'echec'>('non')

  useEffect(() => {
    api
      .get<{ listes: ShoppingListSummary[] }>('/api/mealie/listes')
      .then((res) => {
        setListes(res.listes)
        const rappel = rappelerListe()
        setChoisie(
          rappel && res.listes.some((l) => l.id === rappel) ? rappel : (res.listes[0]?.id ?? null),
        )
      })
      .catch((err) => setError(messageOf(err, 'Listes de courses indisponibles.')))
  }, [])

  const charger = useCallback(async (id: string) => {
    setLoading(true)
    setCopie('non')
    try {
      setListe(await api.get<ShoppingListCross>(`/api/mealie/listes/${id}?today=${todayIso()}`))
      setError(null)
    } catch (err) {
      setError(messageOf(err, 'Liste illisible.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (choisie) void charger(choisie)
  }, [charger, choisie])

  /* Une liste se coche au magasin pendant qu'on la regarde ailleurs : on la
     relit au retour au premier plan, comme l'inventaire. */
  useEffect(() => {
    function auRetour() {
      if (document.visibilityState === 'visible' && choisie) void charger(choisie)
    }
    document.addEventListener('visibilitychange', auRetour)
    return () => document.removeEventListener('visibilitychange', auRetour)
  }, [charger, choisie])

  const groupes = useMemo(() => {
    const items = [...(liste?.items ?? [])].sort((a, b) => a.position - b.position)
    return {
      acheter: items.filter((i) => i.verdict === 'acheter' || i.verdict === 'partiel'),
      verifier: items.filter((i) => i.verdict === 'a-verifier'),
      couvert: items.filter((i) => i.verdict === 'couvert'),
      achete: items.filter((i) => i.verdict === 'achete'),
    }
  }, [liste])

  /* Ce qu'il reste à acheter, rangé par rayon : c'est ainsi qu'on parcourt un
     magasin, et c'est ainsi que Mealie étiquette ses lignes. */
  const parRayon = useMemo(() => {
    const rayons = new Map<string, ShoppingLine[]>()
    for (const ligne of groupes.acheter) {
      const rayon = ligne.label ?? 'Sans rayon'
      rayons.set(rayon, [...(rayons.get(rayon) ?? []), ligne])
    }
    return [...rayons.entries()].sort(([a], [b]) =>
      a === 'Sans rayon' ? 1 : b === 'Sans rayon' ? -1 : a.localeCompare(b, 'fr'),
    )
  }, [groupes])

  async function copier() {
    const lignes = parRayon.flatMap(([rayon, items]) => [
      `— ${rayon}`,
      ...items.map((i) =>
        i.verdict === 'partiel' && i.manque
          ? `${i.name} — il en manque ${quantite(i.manque, i.besoin?.unit)}`
          : libelle(i),
      ),
    ])
    if (groupes.verifier.length > 0) {
      lignes.push('— À vérifier (déjà en partie au placard)', ...groupes.verifier.map(libelle))
    }
    try {
      await navigator.clipboard.writeText(lignes.join('\n'))
      setCopie('oui')
    } catch {
      setCopie('echec')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Listes de courses</h1>
        <Link
          to="/recettes"
          className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Retour
        </Link>
      </div>

      <ErrorText>{error}</ErrorText>

      {listes && listes.length === 0 ? (
        <Card className="text-sm text-slate-400">
          Aucune liste dans Mealie. Ajoutez-y des recettes depuis Mealie (« Ajouter à la liste de
          courses ») : elle apparaîtra ici, confrontée à vos placards.
        </Card>
      ) : null}

      {listes && listes.length > 0 ? (
        <div className="flex gap-2">
          <Select
            value={choisie ?? ''}
            onChange={(e) => {
              setChoisie(e.target.value)
              retenirListe(e.target.value)
            }}
            className="flex-1"
          >
            {listes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            onClick={() => choisie && void charger(choisie)}
            disabled={loading || !choisie}
          >
            {loading ? '…' : 'Relire'}
          </Button>
        </div>
      ) : null}

      {liste ? (
        <>
          {liste.recettes.length > 0 ? (
            <p className="px-1 text-xs text-slate-500">Pour : {liste.recettes.join(', ')}</p>
          ) : null}

          <Card className="grid grid-cols-3 gap-2 text-center">
            <Compteur valeur={groupes.acheter.length} libelle="à acheter" ton="text-amber-300" />
            <Compteur valeur={groupes.couvert.length} libelle="déjà au placard" ton="text-emerald-300" />
            <Compteur valeur={groupes.achete.length} libelle="cochées" ton="text-slate-400" />
          </Card>

          {parRayon.length > 0 ? (
            <section className="space-y-3">
              <h2 className="px-1 text-sm font-semibold tracking-wide text-amber-300 uppercase">
                À acheter
              </h2>
              {parRayon.map(([rayon, items]) => (
                <div key={rayon} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                  <div className="border-b border-slate-800 px-3 py-1.5 text-xs text-slate-500">
                    {rayon}
                  </div>
                  <ul className="divide-y divide-slate-800">
                    {items.map((i) => (
                      <li key={i.id} className="px-3 py-2">
                        <span className="text-slate-100">{libelle(i)}</span>
                        {i.verdict === 'partiel' ? (
                          <span className="block text-xs text-amber-400">
                            vous en avez {quantite(i.quantity, i.unit)} ({i.placeName ?? '—'}) — il
                            en manque {quantite(i.manque ?? undefined, i.besoin?.unit)}
                          </span>
                        ) : i.status === 'inconnu' ? (
                          <span className="block text-xs text-slate-500">
                            non relié : Gestock ne sait pas si vous en avez
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}

          {groupes.verifier.length > 0 ? (
            <Groupe titre="À vérifier" ton="text-slate-300">
              {groupes.verifier.map((i) => (
                <Ligne key={i.id} marque="?" ton="text-slate-400">
                  <span className="text-slate-100">{libelle(i)}</span>
                  <span className="block text-xs text-slate-500">
                    vous en avez {quantite(i.quantity, i.unit)} — {i.productName}
                    {i.placeName ? `, ${i.placeName}` : ''} — quantités non comparables
                  </span>
                </Ligne>
              ))}
            </Groupe>
          ) : null}

          {groupes.couvert.length > 0 ? (
            <Groupe titre="Déjà au placard — inutile de racheter" ton="text-emerald-300">
              {groupes.couvert.map((i) => (
                <Ligne key={i.id} marque="✓" ton="text-emerald-400">
                  <span className="text-slate-100">{libelle(i)}</span>
                  <span className="block text-xs text-slate-500">
                    {i.status === 'toujours'
                      ? 'fond de placard'
                      : [
                          i.productName,
                          i.placeName,
                          quantite(i.quantity, i.unit) || null,
                          i.expiresAt ? expiryLabel(i.expiresAt) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </span>
                </Ligne>
              ))}
            </Groupe>
          ) : null}

          {groupes.achete.length > 0 ? (
            <details className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
              <summary className="cursor-pointer text-sm text-slate-400">
                {groupes.achete.length} ligne(s) déjà cochée(s) dans Mealie
              </summary>
              <ul className="mt-2 space-y-1">
                {groupes.achete.map((i) => (
                  <li key={i.id} className="text-sm text-slate-500 line-through">
                    {libelle(i)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <Button
            variant="secondary"
            className="w-full"
            onClick={copier}
            disabled={groupes.acheter.length + groupes.verifier.length === 0}
          >
            {copie === 'oui'
              ? 'Copié'
              : copie === 'echec'
                ? 'Copie refusée'
                : `Copier ce qu'il reste à acheter (${groupes.acheter.length})`}
          </Button>
        </>
      ) : null}
    </div>
  )
}

function Compteur({ valeur, libelle: texte, ton }: { valeur: number; libelle: string; ton: string }) {
  return (
    <div>
      <div className={`text-2xl font-semibold ${ton}`}>{valeur}</div>
      <div className="text-xs text-slate-500">{texte}</div>
    </div>
  )
}

function Groupe({ titre, ton, children }: { titre: string; ton: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className={`px-1 text-sm font-semibold tracking-wide uppercase ${ton}`}>{titre}</h2>
      <div className="rounded-xl border border-slate-800 bg-slate-900 px-2 py-1">{children}</div>
    </section>
  )
}

function Ligne({ marque, ton, children }: { marque: string; ton: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 px-1 py-1.5">
      <span className={`shrink-0 ${ton}`}>{marque}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
