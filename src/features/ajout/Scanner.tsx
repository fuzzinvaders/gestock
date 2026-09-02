import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { createConfirmer, createReader } from '../../lib/scan'

/** Un coup d'œil toutes les 250 ms : au-delà, la lecture traîne ; en deçà, le
 *  téléphone chauffe pour rien — l'analyse d'une image coûte plus qu'un affichage. */
const INTERVAL_MS = 250

export function Scanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [torchable, setTorchable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  // onDetected change à chaque rendu du parent ; la garder dans une ref évite de
  // couper et relancer la caméra à chaque frappe dans le formulaire d'à côté.
  const onDetectedRef = useRef(onDetected)
  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    const confirm = createConfirmer()

    async function start() {
      // getUserMedia n'existe qu'en contexte sécurisé : en http sur une IP locale,
      // le navigateur ne le propose même pas. Le dire franchement plutôt que de
      // laisser un écran noir sans explication.
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(
          "La caméra n'est accessible qu'en https (ou sur localhost). Saisissez le code à la main.",
        )
        return
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch {
        setError("Caméra indisponible : autorisation refusée, ou déjà utilisée ailleurs.")
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => undefined)
      }

      const track = stream.getVideoTracks()[0]
      setTorchable(Boolean(track?.getCapabilities?.().torch))

      let reader
      try {
        reader = await createReader()
      } catch {
        setError('Lecteur de codes-barres indisponible. Saisissez le code à la main.')
        return
      }
      if (cancelled) return

      timer = window.setInterval(async () => {
        const el = videoRef.current
        if (!el || el.readyState < 2) return
        let codes
        try {
          codes = await reader.detect(el)
        } catch {
          return // une image ratée n'est pas une panne : le tour suivant réessaie
        }
        const value = codes[0]?.rawValue?.trim()
        if (!value || !confirm(value)) return
        navigator.vibrate?.(60)
        onDetectedRef.current(value)
      }, INTERVAL_MS)
    }

    void start()

    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch {
      setTorchable(false)
    }
  }, [torchOn])

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-black">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover"
          playsInline
          muted
          autoPlay
        />
        {/* Une fenêtre de visée : le code-barres lu est celui qu'on y place, et
            cadrer serré aide autant la caméra que la personne qui la tient. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-24 w-4/5 rounded-lg border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-amber-950/60 px-3 py-2 text-sm text-amber-200">{error}</p>
      ) : (
        <p className="text-center text-sm text-slate-400">
          Placez le code-barres dans le cadre.
        </p>
      )}

      <div className="flex gap-2">
        {torchable ? (
          <Button type="button" variant="secondary" onClick={toggleTorch} className="flex-1">
            {torchOn ? '💡 Éteindre' : '💡 Lampe'}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
          Fermer
        </Button>
      </div>
    </div>
  )
}
