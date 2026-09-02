import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorText, Field, Input } from '../../components/ui/Field'
import { useAuth } from '../../hooks/useAuth'
import { AuthShell } from './AuthShell'

export function SetupScreen() {
  const { setup } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Les deux mots de passe ne sont pas identiques.')
      return
    }
    setBusy(true)
    setError(await setup(username, password))
    setBusy(false)
  }

  return (
    <AuthShell
      title="Gestock"
      subtitle="Premier compte du foyer — c'est lui qui invitera les autres."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Identifiant">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </Field>
        <Field label="Mot de passe" hint="6 caractères au minimum.">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Confirmation">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Création…' : 'Créer le compte'}
        </Button>
      </form>
    </AuthShell>
  )
}
