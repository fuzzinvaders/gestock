import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Field, Input } from '../../components/ui/Field'
import { useAuth } from '../../hooks/useAuth'
import { useInventaire } from '../../hooks/useInventaire'
import { api, messageOf } from '../../lib/api'
import { formatShort } from '../../lib/dates'
import type { Invite, SafeUser } from '../../lib/types'

export function ComptePage() {
  const { user, signOut } = useAuth()
  const { lots, products, places } = useInventaire()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-100">
          {user?.username}
          {user?.admin ? <span className="ml-2 text-xs text-emerald-400">admin</span> : null}
        </h1>
        <Button variant="ghost" onClick={signOut}>
          Déconnexion
        </Button>
      </div>

      <Card className="grid grid-cols-3 gap-2 text-center">
        <Stat value={lots.length} label="lots" />
        <Stat value={products.length} label="produits" />
        <Stat value={places.length} label="réserves" />
      </Card>

      <MotDePasse />
      {user?.admin ? <Foyer meId={user.id} /> : null}

      <Card className="space-y-2">
        <h2 className="font-medium text-slate-100">Sauvegarde</h2>
        <p className="text-sm text-slate-400">
          Tout l'inventaire dans un fichier JSON : réserves, produits et lots.
        </p>
        <a
          href="/api/export"
          className="inline-block rounded-lg bg-slate-800 px-4 py-2 font-medium text-slate-100 hover:bg-slate-700"
        >
          Télécharger l'export
        </a>
      </Card>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

function MotDePasse() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await api.post('/api/password', { currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setDone(true)
    } catch (err) {
      setError(messageOf(err, 'Changement impossible.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-medium text-slate-100">Mot de passe</h2>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Actuel">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Nouveau">
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        {done ? <p className="text-sm text-emerald-400">Mot de passe changé.</p> : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Un instant…' : 'Changer'}
        </Button>
      </form>
    </Card>
  )
}

/** Les invitations et les comptes du foyer — visibles du seul administrateur. */
function Foyer({ meId }: { meId: string }) {
  const { users, reload } = useInventaire()
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get<{ invites: Invite[] }>('/api/invites')
      .then((res) => setInvites(res.invites))
      .catch(() => setInvites([]))
  }, [])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<{ invites: Invite[] }>('/api/invites')
      setInvites(res.invites)
    } catch (err) {
      setError(messageOf(err, 'Création impossible.'))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(code: string) {
    try {
      const res = await api.post<{ invites: Invite[] }>('/api/invites/revoke', { code })
      setInvites(res.invites)
    } catch (err) {
      setError(messageOf(err, 'Révocation impossible.'))
    }
  }

  async function removeUser(member: SafeUser) {
    if (!confirm(`Supprimer le compte « ${member.username} » ?`)) return
    try {
      await api.post('/api/users/delete', { id: member.id })
      await reload()
    } catch (err) {
      setError(messageOf(err, 'Suppression impossible.'))
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-medium text-slate-100">Le foyer</h2>
        <p className="text-sm text-slate-400">
          Tout le monde voit et modifie le même inventaire.
        </p>
      </div>

      <ul className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
        {users.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-slate-100">
              {member.username}
              {member.admin ? <span className="ml-2 text-xs text-emerald-400">admin</span> : null}
            </span>
            {member.id === meId || member.admin ? (
              <span className="text-xs text-slate-600">—</span>
            ) : (
              <button
                onClick={() => removeUser(member)}
                className="text-sm text-slate-500 hover:text-red-400"
              >
                supprimer
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-300">Invitations</span>
          <Button variant="secondary" onClick={create} disabled={busy}>
            Nouveau code
          </Button>
        </div>
        {invites.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucun code en attente. Un code se donne de vive voix, il vaut sept jours.
          </p>
        ) : (
          <ul className="space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.code}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <span>
                  <span className="font-mono text-lg tracking-wider text-emerald-300">
                    {invite.code}
                  </span>
                  <span className="ml-2 text-xs text-slate-500">
                    jusqu'au {formatShort(invite.expiresAt.slice(0, 10))}
                  </span>
                </span>
                <button
                  onClick={() => revoke(invite.code)}
                  className="text-sm text-slate-500 hover:text-red-400"
                >
                  annuler
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
