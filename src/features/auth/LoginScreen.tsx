import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorText, Field, Input } from '../../components/ui/Field'
import { useAuth } from '../../hooks/useAuth'
import { AuthShell } from './AuthShell'

export function LoginScreen() {
  const { login, register } = useAuth()
  const [joining, setJoining] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(joining ? await register(username, password, code) : await login(username, password))
    setBusy(false)
  }

  return (
    <AuthShell
      title="Gestock"
      subtitle={joining ? 'Rejoindre le foyer avec un code' : 'Ce qu’il reste dans les placards'}
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
        <Field label="Mot de passe">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={joining ? 'new-password' : 'current-password'}
            required
          />
        </Field>
        {joining ? (
          <Field label="Code d'invitation" hint="Donné par la personne qui a installé Gestock.">
            <Input
              value={code}
              // Les codes sont dictés en majuscules ; les saisir en minuscules ne
              // doit pas être une raison de les refuser.
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              autoCapitalize="characters"
              required
            />
          </Field>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Un instant…' : joining ? 'Rejoindre' : 'Se connecter'}
        </Button>
        <button
          type="button"
          onClick={() => {
            setJoining(!joining)
            setError(null)
          }}
          className="w-full text-sm text-slate-400 hover:text-slate-200"
        >
          {joining ? "J'ai déjà un compte" : "J'ai un code d'invitation"}
        </button>
      </form>
    </AuthShell>
  )
}
