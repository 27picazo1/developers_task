'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AccessCredential, Profile } from '@/lib/types'
import { authorName } from '@/components/task-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface CredentialsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DURATIONS = [
  { hours: 1, label: '1 hora' },
  { hours: 24, label: '24 horas' },
  { hours: 72, label: '3 días' },
  { hours: 168, label: '7 días' },
  { hours: 720, label: '30 días' },
]

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
    return { label: 'En uso', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
  }
  return { label: 'Disponible', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
}

export function CredentialsDialog({ open, onOpenChange }: CredentialsDialogProps) {
  const supabase = useMemo(() => createClient(), [])

  const [kind, setKind] = useState<'permanent' | 'temporary'>('temporary')
  const [hours, setHours] = useState('168')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<AccessCredential | null>(null)

  const [credentials, setCredentials] = useState<AccessCredential[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: creds, error: credsError }, { data: profs }] = await Promise.all([
      supabase.from('access_credentials').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
    ])
    if (credsError) setError(credsError.message)
    setCredentials((creds as AccessCredential[] | null) ?? [])
    setProfiles((profs as Profile[] | null) ?? [])
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)

    const { data, error } = await supabase.rpc('create_access_credential', {
      p_kind: kind,
      p_hours: kind === 'temporary' ? Number(hours) : null,
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
            Genera un código de un solo uso para cada persona. Tendrá que introducirlo después de registrarse.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

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
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Duración del acceso
                </Label>
                <Select value={hours} onValueChange={setHours}>
                  <SelectTrigger className="h-9 w-full bg-background text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.hours} value={String(d.hours)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={`space-y-1.5 ${kind === 'permanent' ? 'sm:col-span-2' : ''}`}>
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
              ? `El acceso dura ${formatDuration(Number(hours))} desde que la persona introduce el código. Después tendrá que pedir otra.`
              : 'El acceso no caduca, pero puedes revocarlo cuando quieras.'}
          </p>

          <Button type="submit" disabled={creating} className="w-full">
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
                      {c.redeemed_at && <> · Canjeada por {profileName(c.redeemed_by)} {timeAgo(c.redeemed_at)}</>}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
