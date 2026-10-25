'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, Loader2, MessageSquare, Pencil, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { can, normalizeRole, type Role } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const MAX_LENGTH = 2000

interface ResourceComment {
  id: string
  resource_id: string
  user_id: string
  content: string
  created_at: string
  edited_at: string | null
}
type Author = { display_name: string | null; email: string | null }

const authorName = (author?: Author) => author?.display_name || author?.email?.split('@')[0] || 'Usuario'
const timeAgo = (date: string) => formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })

/**
 * Comentarios de un recurso. Pueden escribirlos administradores y moderadores.
 * Los comentarios son solo texto: no abren enlaces ni dan acceso a descargas o
 * referencias. La barrera real está en las políticas RLS de Supabase
 * (migración 20261023000000_resource_comments.sql).
 */
export function ResourceComments({ resourceId }: { resourceId: string }) {
  const [supabase] = useState(() => createClient())
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [comments, setComments] = useState<ResourceComment[]>([])
  const [authors, setAuthors] = useState<Record<string, Author>>({})
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchAuthors = useCallback(
    async (ids: string[]) => {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return
      const { data } = await supabase.from('profiles').select('id, display_name, email').in('id', unique)
      if (!data) return
      setAuthors((prev) => ({
        ...prev,
        ...Object.fromEntries(data.map((p) => [p.id as string, { display_name: p.display_name as string | null, email: p.email as string | null }])),
      }))
    },
    [supabase],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setUnavailable(false)
    setComments([])
    setEditingId(null)
    setDraft('')

    void (async () => {
      const [{ data: userData }, { data: roleData }, { data, error }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('my_role'),
        supabase.from('resource_comments').select('*').eq('resource_id', resourceId).order('created_at', { ascending: true }),
      ])
      if (cancelled) return
      setUserId(userData.user?.id ?? null)
      setRole(roleData ? normalizeRole(roleData) : null)
      if (error) {
        // Lo normal: la migración todavía no se ha ejecutado en Supabase.
        setUnavailable(true)
        setLoading(false)
        return
      }
      const rows = (data ?? []) as ResourceComment[]
      setComments(rows)
      await fetchAuthors(rows.map((row) => row.user_id))
      if (!cancelled) setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [resourceId, supabase, fetchAuthors])

  const canComment = can.commentResources(role)
  const canModerate = can.moderateComments(role)

  const addComment = async () => {
    const content = draft.trim()
    if (!content || !userId || sending) return
    setSending(true)
    const { data, error } = await supabase
      .from('resource_comments')
      .insert({ resource_id: resourceId, user_id: userId, content })
      .select('*')
      .single()
    setSending(false)
    if (error || !data) {
      toast.error('No se pudo enviar el comentario')
      return
    }
    setComments((prev) => [...prev, data as ResourceComment])
    setDraft('')
    void fetchAuthors([userId])
  }

  const saveEdit = async (comment: ResourceComment) => {
    const content = editDraft.trim()
    if (!content) return
    if (content === comment.content) {
      setEditingId(null)
      return
    }
    setBusyId(comment.id)
    const { data, error } = await supabase.from('resource_comments').update({ content }).eq('id', comment.id).select('*').single()
    setBusyId(null)
    if (error || !data) {
      toast.error('No se pudo guardar el cambio')
      return
    }
    setComments((prev) => prev.map((item) => (item.id === comment.id ? (data as ResourceComment) : item)))
    setEditingId(null)
  }

  const removeComment = async (comment: ResourceComment) => {
    if (!window.confirm('¿Eliminar este comentario?')) return
    setBusyId(comment.id)
    const { data, error } = await supabase.from('resource_comments').delete().eq('id', comment.id).select('id')
    setBusyId(null)
    if (error || !data?.length) {
      toast.error('No se pudo eliminar el comentario')
      return
    }
    setComments((prev) => prev.filter((item) => item.id !== comment.id))
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground/80">
          <MessageSquare className="h-4 w-4" />
        </span>
        <h3 className="text-base font-semibold tracking-tight">Comentarios</h3>
        {comments.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{comments.length}</span>
        )}
      </div>

      {unavailable ? (
        <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
          Los comentarios todavía no están activados: falta ejecutar la migración <code className="font-mono text-xs">resource_comments</code> en Supabase.
        </p>
      ) : loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando comentarios…
        </p>
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
              Todavía no hay comentarios.
            </p>
          ) : (
            <ul className="space-y-2">
              {comments.map((comment) => {
                const author = authors[comment.user_id]
                const isOwn = comment.user_id === userId
                const isEditing = editingId === comment.id
                const busy = busyId === comment.id
                return (
                  <li key={comment.id} className="group/comment flex gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {authorName(author)[0]?.toUpperCase() || 'U'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{authorName(author)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
                        {comment.edited_at && (
                          <span className="shrink-0 text-xs text-muted-foreground" title={`Editado ${timeAgo(comment.edited_at)}`}>
                            (editado)
                          </span>
                        )}
                        {!isEditing && (isOwn || canModerate) && (
                          <div className="ml-auto flex shrink-0 items-center sm:opacity-0 sm:transition-opacity sm:group-hover/comment:opacity-100 sm:focus-within:opacity-100">
                            {isOwn && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground"
                                aria-label="Editar comentario"
                                onClick={() => {
                                  setEditingId(comment.id)
                                  setEditDraft(comment.content)
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              aria-label="Eliminar comentario"
                              disabled={busy}
                              onClick={() => void removeComment(comment)}
                            >
                              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            </Button>
                          </div>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            autoFocus
                            value={editDraft}
                            maxLength={MAX_LENGTH}
                            rows={3}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                e.stopPropagation()
                                setEditingId(null)
                              }
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault()
                                void saveEdit(comment)
                              }
                            }}
                          />
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                              <X className="size-4" />
                              Cancelar
                            </Button>
                            <Button type="button" size="sm" disabled={busy || !editDraft.trim()} onClick={() => void saveEdit(comment)}>
                              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                              Guardar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">{comment.content}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {canComment ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                maxLength={MAX_LENGTH}
                rows={3}
                placeholder="Escribe un comentario… (Ctrl+Enter para enviar)"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void addComment()
                  }
                }}
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={sending || !draft.trim()} onClick={() => void addComment()}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Comentar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Tu rango no permite escribir comentarios.</p>
          )}
        </>
      )}
    </section>
  )
}
