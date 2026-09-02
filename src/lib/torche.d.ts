/**
 * La lampe du téléphone.
 *
 * `torch` fait partie de l'API Image Capture, que TypeScript ne décrit pas encore
 * dans ses types standards alors que les navigateurs mobiles l'implémentent. On
 * l'ajoute ici plutôt que de forcer un `as unknown` à chaque appel : le champ est
 * facultatif, donc le code doit de toute façon vérifier qu'il existe.
 */
declare global {
  interface MediaTrackCapabilities {
    torch?: boolean
  }

  interface MediaTrackConstraintSet {
    torch?: boolean
  }
}

export {}
