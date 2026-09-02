import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, messageOf } from '../lib/api'
import type { FoodLink, Inventory, Lot, MealieStatus, Place, Product, SafeUser } from '../lib/types'

interface Mutation<T> {
  places: Place[]
  products: Product[]
  lots: Lot[]
  links: FoodLink[]
  entity: T | null
}

interface InventaireContextValue {
  places: Place[]
  products: Product[]
  lots: Lot[]
  links: FoodLink[]
  users: SafeUser[]
  /** État du carnet de recettes, null tant qu'il n'a pas répondu. */
  mealie: MealieStatus | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  savePlace: (id: string | null, body: Partial<Place>) => Promise<Place>
  removePlace: (id: string) => Promise<void>
  saveProduct: (id: string | null, body: Partial<Product>) => Promise<Product>
  removeProduct: (id: string) => Promise<void>
  saveLot: (id: string | null, body: Partial<Lot>) => Promise<Lot>
  consumeLot: (id: string, quantity: number) => Promise<void>
  removeLot: (id: string) => Promise<void>
  saveLink: (foodId: string, body: Partial<FoodLink>) => Promise<void>
  removeLink: (foodId: string) => Promise<void>
  productById: (id: string) => Product | undefined
  placeById: (id: string) => Place | undefined
  sectionName: (placeId: string, sectionId: string | null) => string
}

const InventaireContext = createContext<InventaireContextValue | undefined>(undefined)

export function InventaireProvider({ children }: { children: ReactNode }) {
  const [places, setPlaces] = useState<Place[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [lots, setLots] = useState<Lot[]>([])
  const [links, setLinks] = useState<FoodLink[]>([])
  const [users, setUsers] = useState<SafeUser[]>([])
  const [mealie, setMealie] = useState<MealieStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const data = await api.get<Inventory>('/api/data')
      // L'état de Mealie décide de l'onglet Recettes : sans carnet branché, il ne
      // sert à rien de proposer un écran qui ne pourrait rien afficher.
      api
        .get<MealieStatus>('/api/mealie')
        .then(setMealie)
        .catch(() => setMealie(null))
      setPlaces(data.places)
      setProducts(data.products)
      setLots(data.lots)
      setLinks(data.links)
      setUsers(data.users)
      setError(null)
    } catch (err) {
      setError(messageOf(err, "Impossible de charger l'inventaire."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /* L'inventaire est commun : quelqu'un d'autre a pu ranger les courses pendant
     que l'écran dormait dans une poche. On le relit au retour au premier plan,
     ce qui suffit — un rafraîchissement périodique réveillerait le téléphone
     pour rien la plupart du temps. */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const apply = useCallback(<T,>(data: Mutation<T>): T | null => {
    setPlaces(data.places)
    setProducts(data.products)
    setLots(data.lots)
    setLinks(data.links)
    return data.entity
  }, [])

  const value = useMemo<InventaireContextValue>(() => {
    async function write<T>(
      method: 'post' | 'patch' | 'put' | 'delete',
      path: string,
      body?: unknown,
    ): Promise<T | null> {
      const data =
        method === 'delete'
          ? await api.delete<Mutation<T>>(path)
          : await api[method]<Mutation<T>>(path, body)
      return apply(data)
    }

    /* Une réponse sans « entity » ne devrait pas arriver : le serveur la renvoie
       pour toute écriture qui crée ou modifie. Si elle manque, c'est un bug côté
       serveur, et l'appelant qui attend l'objet doit le savoir tout de suite. */
    function required<T>(entity: T | null, what: string): T {
      if (!entity) throw new Error(`Réponse incomplète du serveur (${what}).`)
      return entity
    }

    return {
      places,
      products,
      lots,
      links,
      users,
      mealie,
      loading,
      error,
      reload,
      savePlace: async (id, body) =>
        required(
          id
            ? await write<Place>('patch', `/api/places/${id}`, body)
            : await write<Place>('post', '/api/places', body),
          'réserve',
        ),
      removePlace: async (id) => {
        await write('delete', `/api/places/${id}`)
      },
      saveProduct: async (id, body) =>
        required(
          id
            ? await write<Product>('patch', `/api/products/${id}`, body)
            : await write<Product>('post', '/api/products', body),
          'produit',
        ),
      removeProduct: async (id) => {
        await write('delete', `/api/products/${id}`)
      },
      saveLot: async (id, body) =>
        required(
          id
            ? await write<Lot>('patch', `/api/lots/${id}`, body)
            : await write<Lot>('post', '/api/lots', body),
          'lot',
        ),
      consumeLot: async (id, quantity) => {
        await write('post', `/api/lots/${id}/consume`, { quantity })
      },
      removeLot: async (id) => {
        await write('delete', `/api/lots/${id}`)
      },
      saveLink: async (foodId, body) => {
        await write('put', `/api/mealie/links/${foodId}`, body)
      },
      removeLink: async (foodId) => {
        await write('delete', `/api/mealie/links/${foodId}`)
      },
      productById: (id) => products.find((p) => p.id === id),
      placeById: (id) => places.find((p) => p.id === id),
      sectionName: (placeId, sectionId) => {
        if (!sectionId) return 'Sans section'
        const place = places.find((p) => p.id === placeId)
        return place?.sections.find((s) => s.id === sectionId)?.name ?? 'Sans section'
      },
    }
  }, [apply, error, links, loading, lots, mealie, places, products, reload, users])

  return <InventaireContext.Provider value={value}>{children}</InventaireContext.Provider>
}

export function useInventaire() {
  const ctx = useContext(InventaireContext)
  if (!ctx) throw new Error('useInventaire must be used within InventaireProvider')
  return ctx
}
