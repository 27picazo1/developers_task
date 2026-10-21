'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AccessCredential, Profile, WorkspaceMember } from '@/lib/types'
import { ROLES, roleBadgeClasses, roleLabels, normalizeRole, type Role } from '@/lib/roles'
import { authorName } from '@/components/task-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Infinity as InfinityIcon,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface CredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: 'credenciales' | 'personas'
}

// Atajos: rellenan el campo de tiempo, que también se puede escribir a mano.
const QUICK_DURATIONS = [
  { hours: 1, label: '1 hora' },
  { hours: 24, label: '1 día' },
  { hours: 72, label: '3 días' },
  { hours: 168, label: '7 días' },
  { hours: 720, label: '30 días' },
]
const MAX_HOURS = 8760 // 365 días

const timeAgo = (date: string) => formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })

function formatDuration(hours: number) {
  if (hours < 24) return hours === 1 ? '1 hora' : `${hours} horas`
  const days = Math.round(hours / 24)
  return days === 1 ? '1 día' : `${days} días`
}

function credentialState(c: AccessCredential) {
  if (c.revoked_at) {
    return { label: 'Revocada', className: 'border-red-500/30 bg-red-500/10 text-red-300' }
  }
  if (c.redeemed_at) {
    if (c.kind === 'temporary' && c.duration_hours) {
      const until = new Date(c.redeemed_at).getTime() + c.duration_hours * 3600000
      if (until <= Date.now()) {
        return { label: 'Acceso caducado', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' }
      }
    }
    return { label: 'Usada', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
  }
  return { label: 'Disponible', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
}

const formatDate = (date: string | number | Date) => format(new Date(date), "d MMM yyyy, HH:mm", { locale: es })

// Hasta cuándo dura el acceso que dio una credencial ya canjeada.
function accessUntilText(c: AccessCredential) {
  if (!c.redeemed_at) return ''
  if (c.kind === 'permanent' || !c.duration_hours) return 'acceso permanente'
  const until = new Date(c.redeemed_at).getTime() + c.duration_hours * 3600000
  return until <= Date.now() ? `acceso caducado el ${formatDate(until)}` : `acceso hasta el ${formatDate(until)}`
}

export function CredentialsDialog({ open, onOpenChange, initialTab = 'credenciales' }: CredentialsDialogProps) {
  const supabase = useMemo(() => createClient(), [])

  const [kind, setKind] = useState<'permanent' | 'temporary'>('temporary')
  const [amount, setAmount] = useState('7')
  const [unit, setUnit] = useState<'hours' | 'days'>('days')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<AccessCredential | null>(null)

  const [credentials, setCredentials] = useState<AccessCredential[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null))
    const [{ data: creds, error: credsError }, { data: profs }, { data: mems }] = await Promise.all([
      supabase.from('access_credentials').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('workspace_members').select('*'),
    ])
    if (credsError) setError(credsError.message)
    setCredentials((creds as AccessCredential[] | null) ?? [])
    setProfiles((profs as Profile[] | null) ?? [])
    setMembers((mems as WorkspaceMember[] | null) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    if (open) {
      setError(null)
      setConfirmRevokeId(null)
      void load()
    } else {
      setFresh(null)
    }
  }, [open, load])

  const profileName = (id: string | null) => {
    if (!id) return 'alguien'
    const p = profiles.find((x) => x.id === id)
    return p ? authorName(p) : 'un usuario'
  }

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500)
    } catch {
      setError('No se pudo copiar al portapapeles. Selecciona el código y cópialo a mano.')
    }
  }

  const applyQuick = (h: number) => {
    if (h % 24 === 0) {
      setAmount(String(h / 24))
      setUnit('days')
    } else {
      setAmount(String(h))
      setUnit('hours')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (kind === 'temporary' && durationInvalid) return
    setCreating(true)
    setError(null)

    const { data, error } = await supabase.rpc('create_access_credential', {
      p_kind: kind,
      p_hours: kind === 'temporary' ? totalHours : null,
      p_note: note.trim() || null,
    })

    setCreating(false)
    if (error) {
      setError(error.message)
      return
    }

    setFresh(data as AccessCredential)
    setNote('')
    await load()
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    setError(null)
    const { error } = await supabase.rpc('revoke_access_credential', { p_id: id })
    setRevokingId(null)
    setConfirmRevokeId(null)
    if (error) {
      setError(error.message)
      return
    }
    if (fresh?.id === id) setFresh(null)
    await load()
  }

  // Tiempo que escribe el admin, convertido a horas y validado (1 hora a 365 días).
  const amountNumber = Number(amount)
  const totalHours =
    amount.trim() !== '' && Number.isInteger(amountNumber) && amountNumber >= 1
      ? amountNumber * (unit === 'days' ? 24 : 1)
      : NaN
  const durationInvalid = !Number.isFinite(totalHours) || totalHours < 1 || totalHours > MAX_HOURS
  const durationError =
    durationInvalid && amount.trim() !== '' ? 'Introduce un número entero entre 1 hora y 365 días.' : null

  const changeRole = async (userId: string, next: Role) => {
    setChangingRoleId(userId)
    setError(null)
    const { error: rpcError } = await supabase.rpc('set_member_role', { p_user: userId, p_role: next })
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setMembers((current) => current.map((m) => (m.user_id === userId ? { ...m, role: next, expires_at: next === 'admin' ? null : m.expires_at } : m)))
    }
    setChangingRoleId(null)
  }

  const people = useMemo(() => {
    const byUser = new Map(members.map((m) => [m.user_id, m]))
    const rank = (m: WorkspaceMember | null) => (m ? ROLES.indexOf(normalizeRole(m.role)) : ROLES.length)
    return profiles
      .map((profile) => ({ profile, member: byUser.get(profile.id) ?? null }))
      .sort((a, b) => rank(a.member) - rank(b.member) || authorName(a.profile).localeCompare(authorName(b.profile)))
  }, [members, profiles])
  const adminCount = people.filter((p) => p.member?.role === 'admin').length
  const modCount = people.filter((p) => p.member?.role === 'moderator').length
  const supportCount = people.filter((p) => p.member && p.member.role !== 'admin' && p.member.role !== 'moderator').length
  const pendingCount = people.filter((p) => !p.member).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-5 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <KeyRound className="h-4 w-4 text-primary" />
            </span>
            Credenciales de acceso
          </DialogTitle>
          <DialogDescription>
            Genera un código de un solo uso para cada persona, con el tiempo de acceso que tú decidas. En cuanto lo introduce, deja de valer.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Tabs defaultValue={initialTab} className="gap-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="credenciales" className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Credenciales
            </TabsTrigger>
            <TabsTrigger value="personas" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Personas
              {people.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{people.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="credenciales" className="space-y-5">
        {/* Nueva credencial */}
        <form onSubmit={handleCreate} className="space-y-4 rounded-2xl border border-border/60 bg-card/40 p-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tipo</Label>
            <div role="radiogroup" aria-label="Tipo de credencial" className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
              <button
                type="button"
                role="radio"
                aria-checked={kind === 'temporary'}
                onClick={() => setKind('temporary')}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-all ${
                  kind === 'temporary'
                    ? 'bg-amber-500/15 text-amber-300 shadow-sm ring-1 ring-amber-500/40'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                }`}
              >
                <Clock className="h-4 w-4" />
                Temporal
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={kind === 'permanent'}
                onClick={() => setKind('permanent')}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-all ${
                  kind === 'permanent'
                    ? 'bg-emerald-500/15 text-emerald-300 shadow-sm ring-1 ring-emerald-500/40'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                }`}
              >
                <InfinityIcon className="h-4 w-4" />
                Permanente
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {kind === 'temporary' && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="credential-amount" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tiempo de acceso
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="credential-amount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="h-9 w-28 bg-background"
                  />
                  <Select value={unit} onValueChange={(v) => setUnit(v as 'hours' | 'days')}>
                    <SelectTrigger className="h-9 w-32 bg-background text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="days">Días</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_DURATIONS.map((d) => (
                    <button
                      key={d.hours}
                      type="button"
                      onClick={() => applyQuick(d.hours)}
                      className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-amber-500/40 hover:text-foreground"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {durationError && <p className="text-xs text-destructive">{durationError}</p>}
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="credential-note" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Para quién (opcional)
              </Label>
              <Input
                id="credential-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej: Marcos, diseñador"
                maxLength={80}
                className="h-9 bg-background"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {kind === 'temporary'
              ? durationInvalid
                ? 'Escribe cuánto tiempo tendrá acceso la persona.'
                : `El acceso dura ${formatDuration(totalHours)} desde que la persona introduce el código. Después tendrá que pedir otra.`
              : 'El acceso no caduca, pero puedes revocarlo cuando quieras.'}
            {' '}El código solo se puede usar una vez.
          </p>

          <Button type="submit" disabled={creating || (kind === 'temporary' && durationInvalid)} className="w-full">
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Generar credencial
          </Button>
        </form>

        {/* Recién generada */}
        {fresh && (
          <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Credencial lista para compartir
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background/70 px-3 py-2.5 text-center font-mono text-xl font-semibold tracking-widest">
                {fresh.code}
              </code>
              <Button type="button" variant="secondary" onClick={() => copy(`fresh-${fresh.id}`, fresh.code)}>
                {copiedKey === `fresh-${fresh.id}` ? (
                  <Check className="mr-1.5 h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="mr-1.5 h-4 w-4" />
                )}
                {copiedKey === `fresh-${fresh.id}` ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Solo se puede usar una vez. Envíasela a la persona por un canal privado.</p>
          </div>
        )}

        {/* Listado */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            Credenciales generadas {credentials.length > 0 && <span className="text-muted-foreground">({credentials.length})</span>}
          </h3>

          {loading && credentials.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando...
            </div>
          ) : credentials.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
              Todavía no has generado ninguna credencial.
            </p>
          ) : (
            <ul className="space-y-2">
              {credentials.map((c) => {
                const state = credentialState(c)
                return (
                  <li key={c.id} className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className={`rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider ${c.revoked_at ? 'text-muted-foreground line-through' : ''}`}>
                        {c.code}
                      </code>
                      {!c.revoked_at && !c.redeemed_at && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copy(c.id, c.code)}
                          aria-label="Copiar credencial"
                        >
                          {copiedKey === c.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium">
                        {c.kind === 'permanent' ? (
                          <><InfinityIcon className="h-3 w-3" />Permanente</>
                        ) : (
                          <><Clock className="h-3 w-3" />Temporal · {formatDuration(c.duration_hours ?? 0)}</>
                        )}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${state.className}`}>{state.label}</span>

                      {!c.revoked_at && (
                        <div className="ml-auto flex items-center gap-1">
                          {confirmRevokeId === c.id ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className="h-7"
                                disabled={revokingId === c.id}
                                onClick={() => handleRevoke(c.id)}
                              >
                                {revokingId === c.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                Confirmar
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setConfirmRevokeId(null)}>
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setConfirmRevokeId(c.id)}
                            >
                              {c.redeemed_at ? 'Quitar acceso' : 'Revocar'}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {c.note && <span className="font-medium text-foreground">{c.note} · </span>}
                      Creada {timeAgo(c.created_at)}
                      {c.redeemed_at && <> · Canjeada por {profileName(c.redeemed_by)} {timeAgo(c.redeemed_at)} · {accessUntilText(c)}</>}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
          </TabsContent>

          <TabsContent value="personas" className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-violet-300">{adminCount}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Admin</p>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-300">{modCount}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Moderadores</p>
              </div>
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-sky-300">{supportCount}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Soporte</p>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-amber-300">{pendingCount}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sin acceso</p>
              </div>
            </div>

            {loading && people.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando...
              </div>
            ) : people.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 px-3 py-6 text-center text-sm text-muted-foreground">
                Todavía no hay personas registradas.
              </p>
            ) : (
              <ul className="space-y-2">
                {people.map(({ profile, member }) => {
                  const memberRole = member ? normalizeRole(member.role) : null
                  const expired = !!member?.expires_at && new Date(member.expires_at).getTime() <= Date.now()
                  const role = memberRole
                    ? { label: roleLabels[memberRole], className: roleBadgeClasses[memberRole], icon: memberRole === 'admin' ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" /> }
                    : { label: 'Sin acceso', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300', icon: <AlertCircle className="h-3 w-3" /> }
                  const isMe = profile.id === meId
                  const access = !member
                    ? 'Registrado, aún no ha introducido una credencial'
                    : expired
                      ? `Acceso caducado el ${formatDate(member.expires_at as string)}`
                      : member.expires_at
                        ? `Acceso hasta el ${formatDate(member.expires_at)}`
                        : 'Acceso permanente'
                  return (
                    <li key={profile.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {authorName(profile)[0]?.toUpperCase() || 'U'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{authorName(profile)}</p>
                        <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
                        <p className={`text-xs ${expired || !member ? 'text-amber-300/90' : 'text-muted-foreground'}`}>{access}</p>
                      </div>
                      {memberRole && !isMe ? (
                        <Select value={memberRole} onValueChange={(v) => void changeRole(profile.id, v as Role)} disabled={changingRoleId === profile.id}>
                          <SelectTrigger className="h-8 w-36 shrink-0 bg-background text-xs" aria-label={`Rango de ${authorName(profile)}`}>
                            {changingRoleId === profile.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${role.className}`}>
                          {role.icon}
                          {role.label}{isMe ? ' (tú)' : ''}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
