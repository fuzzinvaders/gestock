import { describe, expect, it } from 'vitest'
import { addDays, daysUntil, expiryLabel, expiryLevel, isValidIso, todayIso } from './dates'

describe('todayIso', () => {
  it('rend le jour local, pas le jour UTC', () => {
    // 1er mars, 00 h 30 à Paris : UTC est encore au 28 février. C'est le 1er qui
    // doit sortir — sinon une DLC du jour paraît périmée pendant deux heures.
    const nuit = new Date(2026, 2, 1, 0, 30)
    expect(todayIso(nuit)).toBe('2026-03-01')
  })
})

describe('isValidIso', () => {
  it('accepte une date de calendrier', () => {
    expect(isValidIso('2026-02-28')).toBe(true)
  })

  it('refuse un 30 février et les formats approximatifs', () => {
    expect(isValidIso('2026-02-30')).toBe(false)
    expect(isValidIso('2026-2-3')).toBe(false)
    expect(isValidIso('')).toBe(false)
    expect(isValidIso(null)).toBe(false)
  })
})

describe('addDays / daysUntil', () => {
  it('traverse un changement de mois', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
    expect(daysUntil('2026-02-02', '2026-01-30')).toBe(3)
  })

  it('traverse un changement d\'heure sans décaler le jour', () => {
    // Passage à l'heure d'été en France dans la nuit du 28 au 29 mars 2026 : une
    // journée de 23 h, qui ne doit pas raboter le compte de jours.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(daysUntil('2026-03-30', '2026-03-27')).toBe(3)
  })

  it('compte à rebours dans le passé', () => {
    expect(daysUntil('2026-03-01', '2026-03-05')).toBe(-4)
  })
})

describe('expiryLevel', () => {
  const today = '2026-03-10'

  it('classe selon la proximité', () => {
    expect(expiryLevel('2026-03-09', today)).toBe('perime')
    expect(expiryLevel('2026-03-10', today)).toBe('urgent')
    expect(expiryLevel('2026-03-13', today)).toBe('urgent')
    expect(expiryLevel('2026-03-20', today)).toBe('bientot')
    expect(expiryLevel('2026-09-20', today)).toBe('ok')
  })

  it('ne juge pas ce qui n\'a pas de date', () => {
    expect(expiryLevel(null, today)).toBe('sans')
  })
})

describe('expiryLabel', () => {
  const today = '2026-03-10'

  it('parle en français ordinaire', () => {
    expect(expiryLabel('2026-03-10', today)).toBe("périme aujourd'hui")
    expect(expiryLabel('2026-03-11', today)).toBe('périme demain')
    expect(expiryLabel('2026-03-09', today)).toBe('périmé depuis hier')
    expect(expiryLabel('2026-03-05', today)).toBe('périmé depuis 5 jours')
    expect(expiryLabel('2026-03-15', today)).toBe('dans 5 jours')
    expect(expiryLabel(null, today)).toBe('sans date')
  })
})
