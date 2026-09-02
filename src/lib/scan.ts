/**
 * Lecture de codes-barres.
 *
 * Chrome et Edge (Android comme bureau) savent le faire nativement, sans rien
 * télécharger : c'est la voie rapide. Safari et Firefox n'ont pas l'API, on charge
 * alors un lecteur WebAssembly — un mégaoctet environ, importé seulement à ce
 * moment-là pour que les navigateurs équipés ne le paient jamais.
 *
 * Le binaire .wasm est servi par nos propres fichiers plutôt que par un CDN : une
 * appli auto-hébergée doit continuer à scanner quand la maison n'a plus Internet.
 */

import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

/** Les codes que l'on croise sur un emballage alimentaire, et rien d'autre : chaque
 *  format supplémentaire est du temps de calcul par image. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'] as const

export interface DetectedBarcode {
  rawValue: string
  format: string
}

export interface BarcodeReader {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>
  /** D'où vient le lecteur, pour le dire dans l'interface en cas de souci. */
  engine: 'natif' | 'wasm'
}

interface DetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string; format: string }[]>
}

type DetectorConstructor = new (options: { formats: readonly string[] }) => DetectorLike

interface WithBarcodeDetector {
  BarcodeDetector?: DetectorConstructor & {
    getSupportedFormats?: () => Promise<string[]>
  }
}

async function nativeReader(): Promise<BarcodeReader | null> {
  const Native = (window as WithBarcodeDetector).BarcodeDetector
  if (!Native) return null
  try {
    // L'API peut exister sans savoir lire un EAN : sur certains bureaux Linux, la
    // liste des formats revient vide. Mieux vaut le voir ici qu'au premier scan.
    const supported = (await Native.getSupportedFormats?.()) ?? []
    if (supported.length > 0 && !supported.includes('ean_13')) return null
    const detector = new Native({ formats: [...FORMATS] })
    return { detect: (source) => detector.detect(source), engine: 'natif' }
  } catch {
    return null
  }
}

let wasmReady: Promise<BarcodeReader> | null = null

function wasmReader(): Promise<BarcodeReader> {
  // Une seule instance pour toute la session : recharger le module à chaque
  // ouverture du scanner ajouterait une seconde d'attente à chaque article.
  if (wasmReady) return wasmReady
  wasmReady = import('barcode-detector/ponyfill').then(
    ({ BarcodeDetector, prepareZXingModule }) => {
      prepareZXingModule({
        overrides: { locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path) },
      })
      const detector = new BarcodeDetector({ formats: [...FORMATS] })
      return {
        detect: (source: ImageBitmapSource) => detector.detect(source),
        engine: 'wasm' as const,
      }
    },
  )
  return wasmReady
}

export async function createReader(): Promise<BarcodeReader> {
  return (await nativeReader()) ?? (await wasmReader())
}

/**
 * Un code lu deux fois de suite avant d'être accepté.
 *
 * Une caméra de téléphone se trompe : sur une image floue, un EAN-13 peut sortir
 * avec un chiffre faux, une seule fois. Exiger deux lectures identiques coûte une
 * fraction de seconde et évite d'ajouter au placard un produit qui n'existe pas.
 */
export function createConfirmer(needed = 2) {
  let last = ''
  let count = 0
  return function confirm(value: string): boolean {
    if (value !== last) {
      last = value
      count = 1
      return needed <= 1
    }
    count += 1
    return count >= needed
  }
}
