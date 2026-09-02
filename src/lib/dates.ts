/**
 * Dates de calendrier, en texte « AAAA-MM-JJ ».
 *
 * Rien ici ne passe par un fuseau : une date de péremption est imprimée sur un
 * couvercle, elle n'a pas d'heure. Manipuler ces dates comme des instants ferait
 * basculer « demain » à « aujourd'hui » chaque soir passé minuit UTC.
 */

const MS_PER_DAY = 86400000

/** Le jour tel que le voit celui qui tient le téléphone, pas le serveur. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

export function isValidIso(iso: string | null | undefined): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const time = toUtc(iso)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === iso
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Nombre de jours à parcourir depuis `from` pour atteindre `iso` (négatif si passé). */
export function daysUntil(iso: string, from: string = todayIso()): number {
  return Math.round((toUtc(iso) - toUtc(from)) / MS_PER_DAY)
}

export type ExpiryLevel = 'perime' | 'urgent' | 'bientot' | 'ok' | 'sans'

/** Seuils volontairement larges : un mois pour un placard, c'est le prochain plein. */
export const URGENT_DAYS = 3
export const SOON_DAYS = 30

export function expiryLevel(expiresAt: string | null, today: string = todayIso()): ExpiryLevel {
  if (!expiresAt || !isValidIso(expiresAt)) return 'sans'
  const days = daysUntil(expiresAt, today)
  if (days < 0) return 'perime'
  if (days <= URGENT_DAYS) return 'urgent'
  if (days <= SOON_DAYS) return 'bientot'
  return 'ok'
}

/** « périmé depuis 2 jours », « demain », « dans 3 semaines » — l'échéance en clair. */
export function expiryLabel(expiresAt: string | null, today: string = todayIso()): string {
  if (!expiresAt || !isValidIso(expiresAt)) return 'sans date'
  const days = daysUntil(expiresAt, today)
  if (days < -1) return `périmé depuis ${-days} jours`
  if (days === -1) return 'périmé depuis hier'
  if (days === 0) return "périme aujourd'hui"
  if (days === 1) return 'périme demain'
  if (days < 14) return `dans ${days} jours`
  if (days < 60) return `dans ${Math.round(days / 7)} semaines`
  if (days < 365) return `dans ${Math.round(days / 30)} mois`
  return `dans ${Math.round(days / 365)} an(s)`
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' })

export function formatLong(iso: string | null): string {
  if (!iso || !isValidIso(iso)) return '—'
  return LONG_DATE.format(new Date(toUtc(iso)))
}

export function formatShort(iso: string | null): string {
  if (!iso || !isValidIso(iso)) return '—'
  return SHORT_DATE.format(new Date(toUtc(iso)))
}
