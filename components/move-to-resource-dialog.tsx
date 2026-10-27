'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Attachment, Category, Profile, ResourceStatus, ResourceType, TaskPriority, TaskWithRelations } from '@/lib/types'
import { MAX_IMAGES, statusColors, statusLabels, typeColors, typeLabels } from '@/lib/resource-config'
import { priorityLabels } from '@/lib/priority-config'
import { buildResourceDraft, resourceImageType, type ResourceDraft } from '@/lib/task-to-resource'
import { VIDEO_TYPE, parseYouTube } from '@/lib/youtube'
import { YouTubeEmbed } from '@/components/youtube-embed'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  Check,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Link2,
  Loader2,
  Star,
  Video,
  X,
} from 'lucide-react'

interface MoveToResourceDialogProps {
  task: TaskWithRelations
  open: boolean
  onOpenChange: (open: boolean) => void
  category: Category | null
  profiles: Profile[]
  /** Se llama cuando el recurso ya está creado. `removedTask` indica si la tarea se ha quitado. */
  onMoved: (info: { removedTask: boolean }) => void
}

type ItemKind = 'image' | 'video' | 'file'

interface MoveItem {
  attachment: Attachment
  kind: ItemKind
  /** Es un enlace (imgur, YouTube...) y no un archivo guardado en R2. */
  external: boolean
  /** Archivo propio en R2: se puede mover, pero no compartir entre tarea y recurso. */
  ownedR2: boolean
  /** Motivo por el que no se puede incluir, si no se puede. */
  blockedReason: string | null
}

const isHttp = (path: string) => /^https?:\/\//i.test(path)
const mediaUrl = (path: string) => (path.startsWith('r2/') ? `/api/file?pathname=${encodeURIComponent(path)}` : path)

function formatSize(bytes: number) {
  if (!bytes) return 'Enlace'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </Label>
  )
}

export function MoveToResourceDialog({ task, open, onOpenChange, category, profiles, onMoved }: MoveToResourceDialogProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [form, setForm] = useState<ResourceDraft>(() => buildResourceDraft(task, category, profiles))
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [bannerId, setBannerId] = useState<string | null>(null)
  const [removeTask, setRemoveTask] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setCurrentUserId(data.user?.id ?? null)
    })
    return () => { active = false }
  }, [supabase])

  // Cada vez que se abre, se parte de una propuesta nueva calculada a partir de la tarea.
  useEffect(() => {
    if (!open) return
    setForm(buildResourceDraft(task, category, profiles))
    setExcluded(new Set())
    setBannerId(null)
    setRemoveTask(true)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id])

  const items: MoveItem[] = useMemo(
    () =>
      task.attachments.map((attachment) => {
        const external = isHttp(attachment.file_path)
        const ownedR2 = !!currentUserId && attachment.file_path.startsWith(`r2/${currentUserId}/`)
        const kind: ItemKind =
          attachment.file_type === VIDEO_TYPE ? 'video' : attachment.file_type.startsWith('image/') ? 'image' : 'file'

        let blockedReason: string | null = null
        if (!external && !ownedR2) {
          blockedReason = attachment.file_path.startsWith('r2/')
            ? 'Lo subió otra persona: solo ella puede moverlo.'
            : 'Formato antiguo: no se puede mover.'
        } else if (ownedR2 && !removeTask) {
          blockedReason = 'Es un archivo tuyo en R2: solo se puede mover, no copiar. Activa «Quitar la tarea».'
        }
        return { attachment, kind, external, ownedR2, blockedReason }
      }),
    [task.attachments, currentUserId, removeTask],
  )

  const isIncluded = (item: MoveItem) => !item.blockedReason && !excluded.has(item.attachment.id)
  const images = items.filter((i) => i.kind === 'image')
  const videos = items.filter((i) => i.kind === 'video')
  const files = items.filter((i) => i.kind === 'file')
  const includedImages = images.filter(isIncluded)
  const includedVideos = videos.filter(isIncluded)
  const includedFiles = files.filter(isIncluded)

  // Portada: la elegida si sigue incluida; si no, la primera imagen incluida.
  const banner = includedImages.find((i) => i.attachment.id === bannerId) ?? includedImages[0] ?? null
  const thumbnails = includedImages.filter((i) => i !== banner)

  const lost = items.filter((i) => !isIncluded(i)).length
  const tooManyImages = includedImages.length > MAX_IMAGES
  const titleMissing = !form.title.trim()
  const canSave = !saving && !titleMissing && !tooManyImages

  const toggle = (id: string) =>
    setExcluded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const set = <K extends keyof ResourceDraft>(key: K, value: ResourceDraft[K]) => setForm((f) => ({ ...f, [key]: value }))

  const tagList = form.tags.split(',').map((t) => t.trim()).filter(Boolean)

  const handleMove = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    let resourceId: string | null = null

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.')

      const { data: created, error: resourceError } = await supabase
        .from('resources')
        .insert({
          user_id: user.id,
          title: form.title.trim(),
          description: form.description.trim() || null,
          resource_type: form.resource_type,
          status: form.status,
          priority: form.priority,
          url: form.url.trim() || null,
          download_url: form.download_url.trim() || null,
          tags: tagList,
          notes: form.notes.trim() || null,
        })
        .select('id')
        .single()
      if (resourceError || !created) throw resourceError ?? new Error('No se pudo crear el recurso.')
      resourceId = created.id as string

      // Orden: imágenes (portada primero), vídeos y archivos.
      const ordered = [
        ...(banner ? [banner] : []),
        ...includedImages.filter((i) => i !== banner),
        ...includedVideos,
        ...includedFiles,
      ]
      if (ordered.length) {
        const rows = ordered.map(({ attachment, kind }, position) => ({
          resource_id: resourceId,
          user_id: user.id,
          file_name: attachment.file_name,
          file_path: attachment.file_path,
          file_type:
            kind === 'image'
              ? resourceImageType(attachment.file_type)
              : kind === 'video'
                ? VIDEO_TYPE
                : attachment.file_type || 'application/octet-stream',
          file_size: attachment.file_size ?? 0,
          position,
          is_banner: !!banner && attachment.id === banner.attachment.id,
        }))
        const { error: attachmentsError } = await supabase.from('resource_attachments').insert(rows)
        if (attachmentsError) throw attachmentsError
      }

      let removedTask = false
      if (removeTask) {
        const { error: deleteError } = await supabase.from('tasks').delete().eq('id', task.id)
        if (deleteError) {
          toast.warning('El recurso se creó, pero no se pudo quitar la tarea. Puedes borrarla a mano.')
        } else {
          removedTask = true
          // Archivos tuyos que decidiste no mover: se borran con la tarea, como al eliminarla.
          for (const item of items) {
            if (item.ownedR2 && !isIncluded(item)) {
              fetch('/api/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pathname: item.attachment.file_path }),
              }).catch(() => undefined)
            }
          }
        }
      }

      toast.success('Recurso creado', {
        description: removedTask ? 'La tarea se ha movido a Recursos.' : 'Se ha copiado a Recursos y la tarea sigue en su sitio.',
        action: { label: 'Ver recursos', onClick: () => router.push('/resources') },
      })
      onOpenChange(false)
      onMoved({ removedTask })
    } catch (err) {
      // Si algo falla a mitad, no se deja un recurso a medias.
      if (resourceId) {
        await supabase.from('resources').delete().eq('id', resourceId)
      }
      const e = err as { message?: string; code?: string } | null
      setError(
        e?.code === '23514'
          ? 'La base de datos aún no admite imágenes ni vídeos por enlace en Recursos. Ejecuta la migración 20261021000000_resource_external_attachments.sql en Supabase y vuelve a intentarlo.'
          : e?.message || 'No se pudo mover la tarea a recursos.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[94vh] max-h-[920px] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-border/60 bg-muted/20 px-6 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bookmark className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl font-semibold">Mover a recursos</DialogTitle>
            <DialogDescription className="mt-0.5">
              Revisa y edita todo antes de crear el recurso. A la derecha ves cómo quedará en la biblioteca.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Cerrar" disabled={saving}>
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Formulario */}
          <div className="min-w-0 flex-1 space-y-6 p-6 lg:overflow-y-auto">
            <div className="space-y-1.5">
              <FieldLabel htmlFor="move-title">Título</FieldLabel>
              <Input id="move-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} />
              {titleMissing && <p className="text-xs text-destructive">El recurso necesita un título.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <FieldLabel>Tipo</FieldLabel>
                <Select value={form.resource_type} onValueChange={(v) => set('resource_type', v as ResourceType)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Estado</FieldLabel>
                <Select value={form.status} onValueChange={(v) => set('status', v as ResourceStatus)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Prioridad</FieldLabel>
                <Select value={form.priority} onValueChange={(v) => set('priority', v as TaskPriority)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="move-tags">Etiquetas</FieldLabel>
              <Input id="move-tags" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="qbcore, ui" />
              <p className="text-xs text-muted-foreground">Separadas por comas.</p>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="move-description">Descripción</FieldLabel>
              <Textarea
                id="move-description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
                placeholder="Qué contiene y para qué sirve..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel htmlFor="move-url">Enlace de referencia</FieldLabel>
                <Input id="move-url" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-1.5">
                <FieldLabel htmlFor="move-download">Enlace de descarga</FieldLabel>
                <Input id="move-download" type="url" value={form.download_url} onChange={(e) => set('download_url', e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div className="space-y-1.5">
              <FieldLabel htmlFor="move-notes">Notas privadas</FieldLabel>
              <Textarea
                id="move-notes"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={7}
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-xs text-muted-foreground">Incluye un resumen de las subtareas y los comentarios de la tarea. Edítalo o bórralo si no lo necesitas.</p>
            </div>

            {/* Contenido que se mueve */}
            {items.length > 0 && (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-card/40 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Contenido que se mueve</h3>
                  <p className="text-xs text-muted-foreground">Desmarca lo que no quieras llevarte.</p>
                </div>

                {images.length > 0 && (
                  <div className="space-y-2">
                    <FieldLabel>Imágenes</FieldLabel>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {images.map((item) => {
                        const included = isIncluded(item)
                        const isBanner = banner === item
                        return (
                          <div
                            key={item.attachment.id}
                            className={`relative overflow-hidden rounded-lg border ${isBanner ? 'border-primary ring-1 ring-primary' : 'border-border'} ${included ? '' : 'opacity-40'}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={mediaUrl(item.attachment.file_path)} alt={item.attachment.file_name} className="aspect-[4/3] w-full object-cover" />
                            <label className="absolute left-1.5 top-1.5 flex cursor-pointer items-center rounded bg-background/80 p-1 backdrop-blur">
                              <Checkbox
                                checked={included}
                                disabled={!!item.blockedReason}
                                onCheckedChange={() => toggle(item.attachment.id)}
                                aria-label={`Incluir ${item.attachment.file_name}`}
                              />
                            </label>
                            {included && (
                              <button
                                type="button"
                                onClick={() => setBannerId(item.attachment.id)}
                                className={`flex w-full items-center justify-center gap-1 px-2 py-1 text-[11px] ${isBanner ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                aria-pressed={isBanner}
                              >
                                <Star className={`h-3 w-3 ${isBanner ? 'fill-current' : ''}`} />
                                {isBanner ? 'Portada' : 'Elegir portada'}
                              </button>
                            )}
                            {item.blockedReason && <p className="px-2 py-1 text-[10px] leading-tight text-amber-300">{item.blockedReason}</p>}
                          </div>
                        )
                      })}
                    </div>
                    {tooManyImages && (
                      <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Un recurso admite como máximo {MAX_IMAGES} imágenes. Desmarca {includedImages.length - MAX_IMAGES}.
                      </p>
                    )}
                  </div>
                )}

                {[...videos, ...files].length > 0 && (
                  <div className="space-y-2">
                    <FieldLabel>Vídeos y archivos</FieldLabel>
                    <ul className="space-y-2">
                      {[...videos, ...files].map((item) => {
                        const included = isIncluded(item)
                        return (
                          <li key={item.attachment.id} className={`flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm ${included ? '' : 'opacity-50'}`}>
                            <Checkbox
                              checked={included}
                              disabled={!!item.blockedReason}
                              onCheckedChange={() => toggle(item.attachment.id)}
                              aria-label={`Incluir ${item.attachment.file_name}`}
                            />
                            {item.kind === 'video' ? <Video className="h-4 w-4 shrink-0 text-red-400" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{item.attachment.file_name}</p>
                              {item.blockedReason && <p className="text-[11px] text-amber-300">{item.blockedReason}</p>}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">{item.kind === 'video' ? 'YouTube' : formatSize(item.attachment.file_size)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Qué pasa con la tarea */}
            <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-4">
              <div className="flex items-start gap-3">
                <Switch id="move-remove-task" checked={removeTask} onCheckedChange={setRemoveTask} className="mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="move-remove-task" className="text-sm font-medium">Quitar la tarea después de moverla</Label>
                  <p className="text-xs text-muted-foreground">
                    {removeTask
                      ? 'La tarea desaparece de Tareas. Sus subtareas y comentarios quedan resumidos en las notas.'
                      : 'La tarea se queda donde está y el recurso es una copia. Los archivos subidos a R2 no se pueden copiar.'}
                  </p>
                </div>
              </div>
              {removeTask && lost > 0 && (
                <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {lost === 1 ? '1 elemento no se moverá y se perderá' : `${lost} elementos no se moverán y se perderán`} al quitar la tarea.
                </p>
              )}
            </div>
          </div>

          {/* Vista previa */}
          <aside className="shrink-0 space-y-3 border-t border-border/60 bg-muted/20 p-5 lg:w-[380px] lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              Así se verá en Recursos
            </div>

            <Card className="group overflow-hidden border-border/60 bg-card/70">
              {banner && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(banner.attachment.file_path)} alt={`Portada: ${form.title}`} className="aspect-[16/8] w-full object-cover" />
              )}
              <CardHeader className="pb-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge className={typeColors[form.resource_type]}>{typeLabels[form.resource_type]}</Badge>
                  <Badge className={statusColors[form.status]}>{statusLabels[form.status]}</Badge>
                </div>
                <CardTitle className="mt-3 text-lg">{form.title.trim() || 'Sin título'}</CardTitle>
                <CardDescription className="line-clamp-2">{form.description.trim() || 'Sin descripción'}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {includedVideos.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {includedVideos.map(({ attachment }) => {
                      const yt = parseYouTube(attachment.file_path)
                      return yt ? (
                        <div key={attachment.id} className="flex flex-col gap-1.5">
                          <YouTubeEmbed key={yt.id} id={yt.id} start={yt.start} title={attachment.file_name} />
                          <p className="truncate text-xs text-muted-foreground">{attachment.file_name}</p>
                        </div>
                      ) : null
                    })}
                  </div>
                )}
                {thumbnails.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {thumbnails.map(({ attachment }) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={attachment.id} src={mediaUrl(attachment.file_path)} alt={attachment.file_name} className="size-14 shrink-0 rounded-md border border-border/70 object-cover" />
                    ))}
                  </div>
                )}
                {includedFiles.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {includedFiles.map(({ attachment }) => (
                      <span key={attachment.id} className="flex items-center gap-2 truncate text-sm text-primary">
                        <FileText className="size-4 shrink-0" />
                        <span className="truncate">{attachment.file_name}</span>
                        <Download className="ml-auto size-3.5 shrink-0" />
                      </span>
                    ))}
                  </div>
                )}
                {tagList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tagList.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                  {form.url.trim() && (
                    <Button asChild variant="outline" size="sm">
                      <a href={form.url.trim()} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Referencia</a>
                    </Button>
                  )}
                  {form.download_url.trim() && (
                    <Button asChild size="sm">
                      <a href={form.download_url.trim()} target="_blank" rel="noreferrer"><Download data-icon="inline-start" />Descarga</a>
                    </Button>
                  )}
                  {!form.url.trim() && !form.download_url.trim() && (
                    <span className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="size-3.5" />Sin enlaces</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {form.notes.trim() && (
              <div className="rounded-xl border border-border/60 bg-background/50 p-3">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notas privadas</p>
                <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{form.notes}</p>
              </div>
            )}
          </aside>
        </div>

        <div className="shrink-0 space-y-2 border-t border-border/60 bg-background px-6 py-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleMove} disabled={!canSave}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : removeTask ? <ArrowRight className="mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}
              {saving ? 'Moviendo…' : removeTask ? 'Mover a recursos' : 'Copiar a recursos'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
