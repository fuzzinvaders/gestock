export type PlaceKind = 'congelateur' | 'frigo' | 'placard' | 'cave' | 'autre'

export interface Section {
  id: string
  name: string
  /** Colonne du dessin : 0 à gauche. Un frigo américain en a deux. */
  column: number
}

export interface Place {
  id: string
  name: string
  kind: PlaceKind
  /** Nombre de battants du meuble, 1 par défaut. */
  columns: number
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
  /** L'unité de CE lot : le même produit se range en pièces ou en grammes. */
  unit: string
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

/**
 * Correspondance entre un aliment du carnet Mealie et le placard.
 * `always` désigne ce qu'on ne compte pas — le sel, l'huile, l'eau — et qui doit
 * néanmoins être considéré comme disponible.
 */
export interface FoodLink {
  foodId: string
  foodName: string
  productId: string | null
  always: boolean
}

export interface Inventory {
  places: Place[]
  products: Product[]
  lots: Lot[]
  links: FoodLink[]
  users: SafeUser[]
}

/** Un aliment Mealie encore sans réponse, avec le produit que le serveur propose. */
export interface PendingFood {
  foodId: string
  foodName: string
  count: number
  suggestion: { productId: string; productName: string } | null
}

/**
 * L'état d'un ingrédient de recette vis-à-vis du placard.
 * « manque » et « inconnu » s'achètent tous les deux, mais le second est une
 * ignorance — l'aliment n'a jamais été relié — et se corrige sans passer en caisse.
 */
export type IngredientStatus = 'stock' | 'toujours' | 'manque' | 'inconnu'

export interface RecipeIngredient {
  foodId: string
  name: string
  status: IngredientStatus
  /** Ce que la recette demande, tel qu'écrit dans Mealie. */
  besoin: { quantity: number; unit: string } | null
  /** true / false quand les unités se traduisent, null quand elles ne se traduisent pas. */
  assez?: boolean | null
  /** Ce qui manque, dans l'unité de la recette. */
  manque?: number | null
  productId?: string
  productName?: string
  placeName?: string | null
  quantity?: number
  unit?: string
  lotId?: string
  expiresAt?: string | null
  level?: 'perime' | 'urgent' | 'bientot' | 'ok' | 'sans'
}

export interface RecipeCross {
  slug: string
  name: string
  url: string
  image: string
  totalTime: string | null
  servings: number | null
  /** Lignes d'ingrédients en texte libre : invérifiables, donc signalées. */
  freeText: number
  ingredients: RecipeIngredient[]
  haveCount: number
  missingCount: number
  urgent: boolean
  soonest: string | null
}

export interface MealieStatus {
  configured: boolean
  url: string
  /** Aperçu du jeton reçu par le serveur : assez pour le reconnaître, pas pour l'employer. */
  token: { length: number; apercu: string; jwt: boolean } | null
  lastError: string | null
  stale: boolean
  fetchedAt: number | null
  recipeCount: number
  foodCount: number
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
