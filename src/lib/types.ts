export type PlaceKind = 'congelateur' | 'frigo' | 'placard' | 'cave' | 'autre'

export interface Section {
  id: string
  name: string
}

export interface Place {
  id: string
  name: string
  kind: PlaceKind
  sections: Section[]
  createdAt: string
}

export interface Product {
  id: string
  name: string
  brand: string
  category: string
  unit: string
  /** Code-barres EAN/UPC, absent pour tout ce qui se vend en vrac ou se cuisine. */
  ean: string | null
  /** Durée de conservation habituelle, en jours : sert à proposer une péremption. */
  shelfLifeDays: number | null
  imageUrl: string | null
  createdAt: string
}

/** Un exemplaire rangé quelque part : ce paquet-là, à cet endroit-là, depuis cette date-là. */
export interface Lot {
  id: string
  productId: string
  placeId: string
  sectionId: string | null
  quantity: number
  storedAt: string
  expiresAt: string | null
  note: string
  addedAt: string
  addedBy: string
  updatedAt: string
  updatedBy: string
}

export interface SafeUser {
  id: string
  username: string
  admin: boolean
  createdAt: string
}

export interface Inventory {
  places: Place[]
  products: Product[]
  lots: Lot[]
  users: SafeUser[]
}

export interface Invite {
  code: string
  createdAt: string
  expiresAt: string
}

/** Ce que renvoie /api/lookup : la fiche du foyer, celle d'Open Food Facts, ou rien. */
export interface LookupResult {
  found: boolean
  source: 'gestock' | 'cache' | 'openfoodfacts' | 'hors-ligne'
  product: {
    name: string
    brand: string
    category: string
    imageUrl: string | null
    unit?: string
    shelfLifeDays?: number | null
    id?: string
  } | null
}

export const PLACE_KINDS: { value: PlaceKind; label: string; icon: string }[] = [
  { value: 'congelateur', label: 'Congélateur', icon: '❄️' },
  { value: 'frigo', label: 'Réfrigérateur', icon: '🧊' },
  { value: 'placard', label: 'Placard', icon: '🗄️' },
  { value: 'cave', label: 'Cave', icon: '🍷' },
  { value: 'autre', label: 'Autre', icon: '📦' },
]

export const UNITS = ['pièce', 'portion', 'g', 'kg', 'mL', 'L', 'sachet', 'boîte', 'bocal']

export function placeKindLabel(kind: PlaceKind): string {
  return PLACE_KINDS.find((k) => k.value === kind)?.label ?? 'Autre'
}

export function placeKindIcon(kind: PlaceKind): string {
  return PLACE_KINDS.find((k) => k.value === kind)?.icon ?? '📦'
}
