'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TaskWithRelations, Subtask, Attachment, Category, TaskStatus, TaskPriority, TaskType, Profile } from '@/lib/types'
import { typeConfig, typeOrder, getType } from '@/lib/task-config'
import { authorName } from '@/components/task-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Globe,
  ImageOff,
  Link,
  ListChecks,
  Loader2,
  Maximize2,
  MessageSquare,
  Paperclip,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface TaskDetailProps {
  task: TaskWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  profiles?: Profile[]
  onUpdate: () => void
  onDelete: () => void
}

const statusConfig = {
  pending: { label: 'Pendiente', icon: Circle, iconClass: 'text-blue-400' },
  in_progress: { label: 'En progreso', icon: Clock, iconClass: 'text-amber-400' },
  completed: { label: 'Completada', icon: CheckCircle2, iconClass: 'text-emerald-400' },
}

const priorityConfig = {
  low: { label: 'Baja', dot: 'bg-emerald-400' },
  medium: { label: 'Media', dot: 'bg-amber-400' },
  high: { label: 'Alta', dot: 'bg-red-400' },
}

// Degradado y brillo de la portada según el tipo de tarea.
const typeHero: Record<TaskType, { gradient: string; glow: string }> = {
  bug: { gradient: 'from-red-500/35 via-red-500/10 to-transparent', glow: 'bg-red-500/30' },
  idea: { gradient: 'from-yellow-500/35 via-yellow-500/10 to-transparent', glow: 'bg-yellow-500/30' },
  improvement: { gradient: 'from-violet-500/35 via-violet-500/10 to-transparent', glow: 'bg-violet-500/30' },
  task: { gradient: 'from-sky-500/35 via-sky-500/10 to-transparent', glow: 'bg-sky-500/30' },
}

const statusActive: Record<TaskStatus, string> = {
  pending: 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/40',
  in_progress: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40',
}

const priorityActive: Record<TaskPriority, string> = {
  low: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40',
  medium: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40',
  high: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40',
}

const timeAgo = (date: string) => formatDistanceToNow(new Date(date), { addSuffix: true, locale: es })

const fileExt = (name: string) => {
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : ''
  return ext.slice(0, 4).toUpperCase() || 'FILE'
}

const URL_SPLIT = /(https?:\/\/[^\s]+)/g
const IS_URL = /^https?:\/\//

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_SPLIT).map((part, i) =>
        IS_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sky-400 underline-offset-2 hover:underline"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function LinkCard({ url }: { url: string }) {
  let host = url
  let rest = ''
  try {
    const u = new URL(url)
    host = u.hostname.replace(/^www\./, '')
    rest = `${u.pathname}${u.search}`.replace(/^\/$/, '')
  } catch {
    // URL no válida: se muestra tal cual
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card/50 p-3 transition hover:border-sky-500/50 hover:bg-card"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-sky-500/5 text-sky-300 ring-1 ring-sky-500/30">
        <Globe className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{host}</p>
        {rest && <p className="truncate text-xs text-muted-foreground">{rest}</p>}
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-sky-300" />
    </a>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  stacked = false,
}: {
  label: string
  stacked?: boolean
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon: React.ReactNode; activeClass: string }[]
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1 rounded-xl bg-muted/50 p-1"
        style={{ gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { if (!active) onChange(o.value) }}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all ${stacked ? 'justify-start px-3' : 'justify-center'} ${
                active ? `${o.activeClass} shadow-sm` : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
              }`}
            >
              {o.icon}
              <span className="truncate">{o.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
}

function SectionTitle({
  icon: Icon,
  children,
  count,
}: {
  icon: typeof Paperclip
  children: React.ReactNode
  count?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground/80">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-base font-semibold tracking-tight">{children}</h3>
      {count && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{count}</span>
      )}
    </div>
  )
}

interface LightboxImage {
  id: string
  name: string
  src: string
}

function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[]
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const image = index !== null ? images[index] : null
  const hasMany = images.length > 1

  const go = (delta: number) => {
    if (index === null) return
    onIndexChange((index + delta + images.length) % images.length)
  }

  return (
    <Dialog open={index !== null && !!image} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden border-white/10 bg-black/95 p-0 sm:max-w-[min(96vw,1100px)]"
        onKeyDown={(e) => {
          if (!hasMany) return
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
        }}
      >
        <DialogTitle className="sr-only">{image?.name ?? 'Imagen'}</DialogTitle>
        <DialogDescription className="sr-only">Vista ampliada de la imagen adjunta</DialogDescription>
        {image && (
          <>
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-white">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{image.name}</p>
              {hasMany && (
                <span className="text-xs text-white/60">{(index ?? 0) + 1} / {images.length}</span>
              )}
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white">
                <a href={image.src} target="_blank" rel="noopener noreferrer" title="Abrir original">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white">
                <a href={image.src} download={image.name} title="Descargar">
                  <Download className="h-4 w-4" />
                </a>
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" title="Cerrar">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
            <div className="relative flex min-h-[40vh] items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={image.id}
                src={image.src}
                alt={image.name}
                className="max-h-[78vh] max-w-full rounded-md object-contain"
              />
              {hasMany && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20"
                    onClick={() => go(-1)}
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20"
                    onClick={() => go(1)}
                    aria-label="Imagen siguiente"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------- YouTube ----------
// Los vídeos se guardan en la tabla de adjuntos (attachments) con este tipo, así
// que no hace falta ninguna migración en Supabase.
const VIDEO_TYPE = 'video/youtube'
const YT_ID = /^[A-Za-z0-9_-]{11}$/

interface YouTubeRef {
  id: string
  /** Segundo desde el que empieza (0 = principio). */
  start: number
}

function parseTimeParam(value: string | null) {
  if (!value) return 0
  if (/^\d+$/.test(value)) return Number(value)
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m) return 0
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Reconoce enlaces de YouTube (watch, youtu.be, shorts, embed, live) y devuelve el id del vídeo. */
function parseYouTube(input: string): YouTubeRef | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.replace(/^(www|m)\./, '')
  let id: string | null = null

  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v')
    } else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
      id = m ? m[1] : null
    }
  }

  if (!id || !YT_ID.test(id)) return null
  return { id, start: parseTimeParam(url.searchParams.get('t') ?? url.searchParams.get('start')) }
}

const youTubeWatchUrl = ({ id, start }: YouTubeRef) =>
  `https://www.youtube.com/watch?v=${id}${start > 0 ? `&t=${start}s` : ''}`

async function fetchYouTubeTitle(id: string): Promise<string> {
  const fallback = 'Vídeo de YouTube'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
      { signal: controller.signal },
    )
    if (!res.ok) return fallback
    const json = (await res.json()) as { title?: unknown }
    return typeof json.title === 'string' && json.title.trim() ? json.title.trim().slice(0, 150) : fallback
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}

/** Miniatura con botón de play; al pulsar carga el reproductor dentro de la propia web. */
function YouTubeEmbed({ id, start, title }: { id: string; start: number; title: string }) {
  const [playing, setPlaying] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-black shadow-sm">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1${start > 0 ? `&start=${start}` : ''}`}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Reproducir ${title}`}
        >
          {thumbFailed ? (
            <div className="absolute inset-0 bg-gradient-to-br from-red-600/40 via-zinc-900 to-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              onError={() => setThumbFailed(true)}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute left-1/2 top-1/2 flex h-14 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-red-600 shadow-lg transition-transform duration-200 group-hover:scale-110">
            <Play className="h-6 w-6 translate-x-0.5 fill-white text-white" />
          </span>
        </button>
      )}
    </div>
  )
}

export function TaskDetail({ task, open, onOpenChange, categories, profiles = [], onUpdate, onDelete }: TaskDetailProps) {
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [addingUrl, setAddingUrl] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set())
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [videoUrlInput, setVideoUrlInput] = useState('')
  const [addingVideo, setAddingVideo] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setCurrentUserId(data.user?.id ?? null)
    })
    return () => { active = false }
  }, [supabase])

  // Al cambiar de tarea o cerrar la ventana, se descarta cualquier edición en curso.
  useEffect(() => {
    setEditingCommentId(null)
    setEditError(null)
    setLightboxIndex(null)
    setEditingTitle(false)
    setEditingDescription(false)
    setFieldError(null)
    setVideoError(null)
  }, [task?.id, open])

  if (!task) return null

  const completedSubtasks = task.subtasks.filter((s) => s.completed).length
  const subtaskProgress = task.subtasks.length ? Math.round((completedSubtasks / task.subtasks.length) * 100) : 0
  const taskType = getType(task.type)
  const TypeIcon = taskType.icon
  const author = profiles.find((p) => p.id === task.user_id)
  const profileById = (id: string) => profiles.find((p) => p.id === id)

  const handleTypeChange = async (newType: TaskType) => {
    await supabase.from('tasks').update({ type: newType }).eq('id', task.id)
    onUpdate()
  }

  const handleStatusChange = async (newStatus: TaskStatus) => {
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    onUpdate()
  }

  const handlePriorityChange = async (newPriority: TaskPriority) => {
    await supabase.from('tasks').update({ priority: newPriority }).eq('id', task.id)
    onUpdate()
  }

  const handleCategoryChange = async (categoryId: string) => {
    await supabase.from('tasks').update({ category_id: categoryId === 'none' ? null : categoryId }).eq('id', task.id)
    onUpdate()
  }

  // ----- Título y descripción -----
  const startEditTitle = () => {
    setTitleDraft(task.title)
    setFieldError(null)
    setEditingTitle(true)
  }

  const cancelEditTitle = () => {
    setEditingTitle(false)
    setFieldError(null)
  }

  const saveTitle = async () => {
    if (savingTitle) return
    const title = titleDraft.trim()
    if (!title || title === task.title) {
      cancelEditTitle()
      return
    }
    setSavingTitle(true)
    setFieldError(null)
    const { data, error } = await supabase.from('tasks').update({ title }).eq('id', task.id).select('id')
    setSavingTitle(false)
    if (error || !data || data.length === 0) {
      setFieldError('No se pudo guardar el título. Inténtalo de nuevo.')
      return
    }
    setEditingTitle(false)
    onUpdate()
  }

  const startEditDescription = () => {
    setDescriptionDraft(task.description ?? '')
    setFieldError(null)
    setEditingDescription(true)
  }

  const cancelEditDescription = () => {
    setEditingDescription(false)
    setFieldError(null)
  }

  const saveDescription = async () => {
    if (savingDescription) return
    const description = descriptionDraft.trim()
    if (description === (task.description ?? '').trim()) {
      cancelEditDescription()
      return
    }
    setSavingDescription(true)
    setFieldError(null)
    const { data, error } = await supabase
      .from('tasks')
      .update({ description: description || null })
      .eq('id', task.id)
      .select('id')
    setSavingDescription(false)
    if (error || !data || data.length === 0) {
      setFieldError('No se pudo guardar la descripción. Inténtalo de nuevo.')
      return
    }
    setEditingDescription(false)
    onUpdate()
  }

  // ----- Subtareas -----
  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtask.trim()) return
    await supabase.from('subtasks').insert({ task_id: task.id, title: newSubtask.trim() })
    setNewSubtask('')
    onUpdate()
  }

  const handleToggleSubtask = async (subtask: Subtask) => {
    await supabase.from('subtasks').update({ completed: !subtask.completed }).eq('id', subtask.id)
    onUpdate()
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    await supabase.from('subtasks').delete().eq('id', subtaskId)
    onUpdate()
  }

  // ----- Comentarios -----
  const handleAddComment = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newComment.trim() || sendingComment) return
    setSendingComment(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('comments').insert({
        task_id: task.id,
        user_id: user.id,
        content: newComment.trim(),
      })
      setNewComment('')
      onUpdate()
    } finally {
      setSendingComment(false)
    }
  }

  const startEditComment = (commentId: string, content: string) => {
    setEditingCommentId(commentId)
    setEditText(content)
    setEditError(null)
  }

  const cancelEditComment = () => {
    setEditingCommentId(null)
    setEditText('')
    setEditError(null)
  }

  const handleSaveComment = async (commentId: string, original: string) => {
    const content = editText.trim()
    if (!content || !currentUserId) return
    if (content === original.trim()) {
      cancelEditComment()
      return
    }
    setSavingEdit(true)
    setEditError(null)
    // Con RLS, un UPDATE sin permiso no da error: devuelve 0 filas. Por eso se pide el resultado.
    const { data, error } = await supabase
      .from('comments')
      .update({ content })
      .eq('id', commentId)
      .eq('user_id', currentUserId)
      .select('id')
    setSavingEdit(false)
    if (error || !data || data.length === 0) {
      setEditError('No se pudo guardar el cambio. Comprueba que has aplicado la migración de edición de comentarios en Supabase.')
      return
    }
    cancelEditComment()
    onUpdate()
  }

  const handleDeleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId)
    try {
      await supabase.from('comments').delete().eq('id', commentId).eq('task_id', task.id)
      onUpdate()
    } catch (err) {
      console.error('Delete comment error:', err)
    } finally {
      setDeletingCommentId(null)
    }
  }

  // ----- Vídeos de YouTube -----
  const addVideo = async (rawUrl: string): Promise<boolean> => {
    const parsed = parseYouTube(rawUrl)
    if (!parsed) {
      setVideoError('Ese enlace no parece de YouTube. Prueba con youtube.com/watch?v=… o youtu.be/…')
      return false
    }
    if (task.attachments.some((a) => a.file_type === VIDEO_TYPE && parseYouTube(a.file_path)?.id === parsed.id)) {
      setVideoError('Ese vídeo ya está en la tarea.')
      return false
    }

    setAddingVideo(true)
    setVideoError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false
      const title = await fetchYouTubeTitle(parsed.id)
      const { error } = await supabase.from('attachments').insert({
        task_id: task.id,
        user_id: user.id,
        file_name: title,
        file_path: youTubeWatchUrl(parsed),
        file_type: VIDEO_TYPE,
        file_size: 0,
      })
      if (error) throw error
      setVideoUrlInput('')
      onUpdate()
      return true
    } catch (err) {
      const message = (err as { message?: string } | null)?.message
      setVideoError(message || 'No se pudo añadir el vídeo.')
      return false
    } finally {
      setAddingVideo(false)
    }
  }

  // ----- Archivos / imágenes -----
  const handleAddUrl = async () => {
    const url = imageUrlInput.trim()
    if (!url) return

    // Si pegan un enlace de YouTube aquí, se trata como vídeo.
    if (parseYouTube(url)) {
      if (await addVideo(url)) setImageUrlInput('')
      return
    }

    setAddingUrl(true)
    setUploadError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAddingUrl(false); return }

    try {
      const fileName = url.split('/').pop()?.split('?')[0] || 'imagen'
      const ext = fileName.split('.').pop()?.toLowerCase()
      const fileType = ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
        ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
        : 'image/url'

      await supabase.from('attachments').insert({
        task_id: task.id,
        user_id: user.id,
        file_name: fileName,
        file_path: url,
        file_type: fileType,
        file_size: 0,
      })

      setImageUrlInput('')
      onUpdate()
    } catch (err) {
      console.error('Error adding URL:', err)
      const message = err instanceof Error ? err.message : 'Error al añadir el enlace'
      setUploadError(message)
    }

    setAddingUrl(false)
  }

  const isExternalUrl = (path: string) => path.startsWith('http')

  const handleDeleteAttachment = async (attachment: Attachment) => {
    if (!isExternalUrl(attachment.file_path)) {
      await fetch('/api/delete', {
        method: 'DELETE',
        body: JSON.stringify({ pathname: attachment.file_path }),
      })
    }
    await supabase.from('attachments').delete().eq('id', attachment.id)
    onUpdate()
  }

  const handleDeleteTask = async () => {
    setDeleting(true)
    for (const attachment of task.attachments) {
      if (!isExternalUrl(attachment.file_path)) {
        await fetch('/api/delete', {
          method: 'DELETE',
          body: JSON.stringify({ pathname: attachment.file_path }),
        })
      }
    }
    await supabase.from('tasks').delete().eq('id', task.id)
    setDeleting(false)
    setDeleteConfirm(false)
    onOpenChange(false)
    onDelete()
  }

  const fileUrl = (path: string) =>
    path.startsWith('http') ? path : `/api/file?pathname=${encodeURIComponent(path)}`
  const isImage = (fileType: string) => fileType.startsWith('image/')
  const isVideo = (fileType: string) => fileType.startsWith('video/')
  const isArchive = (fileType: string) => ['application/zip', 'application/x-rar-compressed', 'application/x-rar', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar'].includes(fileType) || /\.(zip|rar|7z|tar|gz)$/i.test(fileType)
  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'Enlace externo'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const videoAttachments = task.attachments.filter((a) => a.file_type === VIDEO_TYPE)
  const imageAttachments = task.attachments.filter((a) => isImage(a.file_type))
  const otherAttachments = task.attachments.filter((a) => !isImage(a.file_type) && a.file_type !== VIDEO_TYPE)
  const fileCount = imageAttachments.length + otherAttachments.length
  const lightboxImages: LightboxImage[] = imageAttachments.map((a) => ({
    id: a.id,
    name: a.file_name,
    src: fileUrl(a.file_path),
  }))
  const coverImage = imageAttachments.find((a) => !brokenImages.has(a.id))
  const hero = typeHero[task.type ?? 'task'] ?? typeHero.task
  const category = categories.find((c) => c.id === task.category_id)
  const descriptionIsLink = !!task.description && /^https?:\/\/\S+$/.test(task.description.trim())

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[94vh] max-h-[920px] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          <DialogDescription className="sr-only">Detalle de la tarea: descripción, vídeos, subtareas, archivos y comentarios</DialogDescription>

          {/* Banner */}
          <div className="relative isolate shrink-0 overflow-hidden border-b border-border/60">
            {coverImage ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fileUrl(coverImage.file_path)}
                  alt=""
                  aria-hidden="true"
                  onError={() => setBrokenImages((prev) => new Set(prev).add(coverImage.id))}
                  className="absolute inset-0 -z-20 h-full w-full object-cover"
                />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/85 to-background/30" />
              </>
            ) : (
              <>
                <div className={`absolute inset-0 -z-20 bg-gradient-to-br ${hero.gradient}`} />
                <div className={`absolute -right-12 -top-16 -z-10 h-56 w-56 rounded-full blur-3xl ${hero.glow}`} />
                <TypeIcon className="absolute -right-2 top-2 -z-10 h-36 w-36 -rotate-12 text-foreground/[0.06]" />
                <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-background to-transparent" />
              </>
            )}

            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full bg-background/70 backdrop-blur hover:bg-background"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>

            <div className="space-y-3 px-6 pb-5 pr-16 pt-10 sm:pt-14">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur ${taskType.className}`}>
                  <TypeIcon className="h-3 w-3" />
                  {taskType.label}
                </span>
                {category && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs font-medium backdrop-blur">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
                    {category.name}
                  </span>
                )}
              </div>

              <DialogTitle asChild>
                <h2 className="text-2xl font-bold leading-tight tracking-tight text-pretty sm:text-3xl">
                  {editingTitle ? (
                    <span className="flex items-center gap-2">
                      <Input
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void saveTitle() }
                          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEditTitle() }
                        }}
                        maxLength={200}
                        autoFocus
                        aria-label="Título de la tarea"
                        className="h-11 bg-background/80 text-xl font-bold sm:text-2xl"
                      />
                      <Button
                        type="button"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        onClick={() => void saveTitle()}
                        disabled={savingTitle || !titleDraft.trim()}
                        aria-label="Guardar título"
                      >
                        {savingTitle ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10 shrink-0"
                        onClick={cancelEditTitle}
                        disabled={savingTitle}
                        aria-label="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={startEditTitle}
                      className="group/title -mx-2 inline-flex max-w-full items-start gap-2 rounded-lg px-2 py-0.5 text-left transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Haz clic para editar el título"
                    >
                      <span className="min-w-0 break-words">{task.title}</span>
                      <Pencil className="mt-2 h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover/title:opacity-100 sm:opacity-0" />
                    </button>
                  )}
                </h2>
              </DialogTitle>
              {editingTitle && fieldError && <p className="text-xs text-destructive">{fieldError}</p>}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Avatar className="h-6 w-6 ring-2 ring-background">
                    <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground">
                      {authorName(author)[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  Creada por <span className="font-medium text-foreground">{authorName(author)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {timeAgo(task.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Cuerpo: contenido a la izquierda, propiedades a la derecha */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            <div className="min-w-0 flex-1 space-y-8 p-6 lg:overflow-y-auto">
              {/* Descripción */}
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center justify-between gap-2">
                  <SectionTitle icon={FileText}>Descripción</SectionTitle>
                  {!editingDescription && task.description && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={startEditDescription}>
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  )}
                </div>

                {editingDescription ? (
                  <div className="space-y-2">
                    <Textarea
                      value={descriptionDraft}
                      onChange={(e) => setDescriptionDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEditDescription() }
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveDescription() }
                      }}
                      rows={6}
                      maxLength={5000}
                      autoFocus
                      placeholder="Explica de qué va la tarea, qué hay que hacer, enlaces útiles..."
                      className="resize-y bg-background text-sm leading-relaxed"
                    />
                    {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
                    <div className="flex items-center justify-end gap-2">
                      <span className="mr-auto hidden text-[11px] text-muted-foreground sm:inline">Esc para cancelar · Ctrl+Enter para guardar</span>
                      <Button type="button" size="sm" variant="ghost" onClick={cancelEditDescription} disabled={savingDescription}>
                        Cancelar
                      </Button>
                      <Button type="button" size="sm" onClick={() => void saveDescription()} disabled={savingDescription}>
                        {savingDescription ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                        Guardar
                      </Button>
                    </div>
                  </div>
                ) : task.description ? (
                  descriptionIsLink ? (
                    <LinkCard url={task.description.trim()} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm leading-relaxed text-foreground/85">
                      <Linkified text={task.description} />
                    </p>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={startEditDescription}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/20 hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Añadir una descripción
                  </button>
                )}
              </section>

              {/* Vídeos */}
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <SectionTitle icon={Video} count={videoAttachments.length > 0 ? String(videoAttachments.length) : undefined}>
                  Vídeos
                </SectionTitle>

                {videoAttachments.length > 0 && (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {videoAttachments.map((video) => {
                      const yt = parseYouTube(video.file_path)
                      return (
                        <div key={video.id} className="group space-y-2">
                          {yt ? (
                            <YouTubeEmbed key={yt.id} id={yt.id} start={yt.start} title={video.file_name} />
                          ) : (
                            <LinkCard url={video.file_path} />
                          )}
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium" title={video.file_name}>{video.file_name}</p>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" asChild>
                              <a href={video.file_path} target="_blank" rel="noopener noreferrer" aria-label="Abrir en YouTube" title="Abrir en YouTube">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteAttachment(video)}
                              aria-label="Quitar vídeo"
                              title="Quitar vídeo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {videoAttachments.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
                    Pega un enlace de YouTube y se verá aquí, sin salir de la web.
                  </p>
                )}

                {videoError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{videoError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrlInput}
                    onChange={(e) => { setVideoUrlInput(e.target.value); if (videoError) setVideoError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addVideo(videoUrlInput) } }}
                    className="h-9"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void addVideo(videoUrlInput)}
                    disabled={addingVideo || !videoUrlInput.trim()}
                  >
                    {addingVideo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Añadir
                      </>
                    )}
                  </Button>
                </div>
              </section>

              {/* Subtareas */}
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <SectionTitle
                  icon={ListChecks}
                  count={task.subtasks.length > 0 ? `${completedSubtasks}/${task.subtasks.length}` : undefined}
                >
                  Subtareas
                </SectionTitle>
                {task.subtasks.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500"
                        style={{ width: `${subtaskProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {subtaskProgress === 100 ? '¡Todo completado! 🎉' : `${subtaskProgress}% completado`}
                    </p>
                  </div>
                )}
                {task.subtasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
                    Divide la tarea en pasos pequeños para seguir el avance.
                  </p>
                )}
                {task.subtasks.length > 0 && (
                  <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50">
                    {task.subtasks.map((subtask) => (
                      <div key={subtask.id} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30">
                        <Checkbox
                          checked={subtask.completed}
                          onCheckedChange={() => handleToggleSubtask(subtask)}
                        />
                        <span className={`flex-1 text-sm ${subtask.completed ? 'text-muted-foreground line-through' : ''}`}>
                          {subtask.title}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={() => handleDeleteSubtask(subtask.id)}
                          aria-label="Eliminar subtarea"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={handleAddSubtask} className="flex gap-2">
                  <Input
                    placeholder="Añadir subtarea..."
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    className="h-9"
                  />
                  <Button type="submit" size="sm" variant="secondary" disabled={!newSubtask.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </form>
              </section>

              {/* Archivos */}
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <SectionTitle icon={Paperclip} count={fileCount > 0 ? String(fileCount) : undefined}>
                  Archivos
                </SectionTitle>

                {imageAttachments.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {imageAttachments.map((attachment, i) => (
                      <div
                        key={attachment.id}
                        className="group relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-muted shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(i)}
                          className="block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Ampliar ${attachment.file_name}`}
                        >
                          {brokenImages.has(attachment.id) ? (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                              <ImageOff className="h-5 w-5" />
                              <span className="text-[11px]">No se puede cargar</span>
                            </div>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={fileUrl(attachment.file_path)}
                              alt={attachment.file_name}
                              loading="lazy"
                              onError={() => setBrokenImages((prev) => new Set(prev).add(attachment.id))}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          )}
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                            <Maximize2 className="h-5 w-5 text-white" />
                          </span>
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                            {attachment.file_name}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="absolute right-1.5 top-1.5 h-7 w-7 bg-background/80 text-destructive opacity-100 backdrop-blur hover:bg-background hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={() => handleDeleteAttachment(attachment)}
                          aria-label={`Eliminar ${attachment.file_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {otherAttachments.length > 0 && (
                  <div className="grid gap-2">
                    {otherAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors hover:border-border hover:bg-card/70"
                      >
                        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-sky-500/10 ring-1 ring-violet-500/30">
                          {isVideo(attachment.file_type) ? (
                            <Video className="h-5 w-5 text-violet-200" />
                          ) : isArchive(attachment.file_type) ? (
                            <FileArchive className="h-5 w-5 text-violet-200" />
                          ) : (
                            <FileText className="h-5 w-5 text-violet-200" />
                          )}
                          <span className="absolute -bottom-1.5 rounded bg-violet-500 px-1 text-[9px] font-bold leading-4 text-white">
                            {fileExt(attachment.file_name)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{attachment.file_name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="secondary" size="sm" className="h-8 gap-1.5" asChild>
                            <a href={fileUrl(attachment.file_path)} download={attachment.file_name}>
                              <Download className="h-4 w-4" />
                              <span className="hidden sm:inline">Descargar</span>
                              <span className="sr-only sm:hidden">Descargar</span>
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteAttachment(attachment)}
                            aria-label="Eliminar archivo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {fileCount === 0 && (
                  <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
                    Aún no hay archivos. Pega el enlace de una imagen para añadirla.
                  </p>
                )}

                {uploadError && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {uploadError}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://i.imgur.com/ejemplo.png"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddUrl() } }}
                    className="h-9"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddUrl}
                    disabled={addingUrl || !imageUrlInput.trim()}
                  >
                    {addingUrl ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Link className="mr-2 h-4 w-4" />
                        Añadir
                      </>
                    )}
                  </Button>
                </div>
              </section>

              {/* Comentarios */}
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <SectionTitle
                  icon={MessageSquare}
                  count={task.comments.length > 0 ? String(task.comments.length) : undefined}
                >
                  Comentarios
                </SectionTitle>

                {task.comments.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
                    Todavía no hay comentarios. Sé el primero en escribir.
                  </p>
                )}

                {task.comments.length > 0 && (
                  <div className="space-y-2.5">
                    {task.comments.map((comment) => {
                      const commentAuthor = comment.profile ?? profileById(comment.user_id)
                      const isOwn = !!currentUserId && comment.user_id === currentUserId
                      const isEditing = editingCommentId === comment.id
                      const wasEdited = !!comment.edited_at

                      return (
                        <div
                          key={comment.id}
                          className={`group/comment flex gap-3 rounded-xl border p-3 transition-colors ${
                            isOwn ? 'border-primary/20 bg-primary/5' : 'border-border/50 bg-muted/20 hover:bg-muted/30'
                          }`}
                        >
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-xs text-primary">
                              {authorName(commentAuthor)[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="text-sm font-medium">{authorName(commentAuthor)}</span>
                                <span className="text-xs text-muted-foreground">{timeAgo(comment.created_at)}</span>
                                {wasEdited && (
                                  <span
                                    className="text-xs italic text-muted-foreground"
                                    title={`Editado ${timeAgo(comment.edited_at as string)}`}
                                  >
                                    (editado)
                                  </span>
                                )}
                              </div>
                              {isOwn && !isEditing && (
                                <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-hover/comment:opacity-100 sm:focus-within:opacity-100">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => startEditComment(comment.id, comment.content)}
                                    aria-label="Editar comentario"
                                    title="Editar"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteComment(comment.id)}
                                    disabled={deletingCommentId === comment.id}
                                    aria-label="Eliminar comentario"
                                    title="Eliminar"
                                  >
                                    {deletingCommentId === comment.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              )}
                            </div>

                            {isEditing ? (
                              <div className="space-y-2">
                                <Textarea
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEditComment() }
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                      e.preventDefault()
                                      handleSaveComment(comment.id, comment.content)
                                    }
                                  }}
                                  rows={3}
                                  autoFocus
                                  className="resize-none bg-background text-sm"
                                />
                                {editError && <p className="text-xs text-destructive">{editError}</p>}
                                <div className="flex items-center justify-end gap-2">
                                  <span className="mr-auto hidden text-[11px] text-muted-foreground sm:inline">
                                    Esc para cancelar · Ctrl+Enter para guardar
                                  </span>
                                  <Button type="button" size="sm" variant="ghost" onClick={cancelEditComment} disabled={savingEdit}>
                                    Cancelar
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => handleSaveComment(comment.id, comment.content)}
                                    disabled={savingEdit || !editText.trim()}
                                  >
                                    {savingEdit ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    Guardar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
                                {comment.content}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <form onSubmit={handleAddComment} className="flex gap-2 pt-1">
                  <Textarea
                    placeholder="Escribe un comentario..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        handleAddComment()
                      }
                    }}
                    rows={2}
                    className="resize-none"
                  />
                  <Button type="submit" size="icon" className="shrink-0 self-end" disabled={!newComment.trim() || sendingComment}>
                    {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </section>
            </div>

            {/* Barra lateral de propiedades */}
            <aside className="shrink-0 space-y-5 border-t border-border/60 bg-muted/20 p-5 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
              <Segmented<TaskStatus>
                label="Estado"
                stacked
                value={task.status}
                onChange={handleStatusChange}
                options={(Object.keys(statusConfig) as TaskStatus[]).map((s) => {
                  const Icon = statusConfig[s].icon
                  return {
                    value: s,
                    label: statusConfig[s].label,
                    icon: <Icon className="h-3.5 w-3.5 shrink-0" />,
                    activeClass: statusActive[s],
                  }
                })}
              />
              <Segmented<TaskPriority>
                label="Prioridad"
                value={task.priority}
                onChange={handlePriorityChange}
                options={(Object.keys(priorityConfig) as TaskPriority[]).map((p) => ({
                  value: p,
                  label: priorityConfig[p].label,
                  icon: <span className={`h-2 w-2 shrink-0 rounded-full ${priorityConfig[p].dot}`} />,
                  activeClass: priorityActive[p],
                }))}
              />

              <div className="space-y-1.5">
                <FieldLabel>Tipo</FieldLabel>
                <Select value={task.type ?? 'task'} onValueChange={(v) => handleTypeChange(v as TaskType)}>
                  <SelectTrigger className="h-9 w-full bg-background text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {typeOrder.map((t) => {
                      const Icon = typeConfig[t].icon
                      return (
                        <SelectItem key={t} value={t}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {typeConfig[t].label}
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <FieldLabel>Categoría</FieldLabel>
                <Select value={task.category_id || 'none'} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="h-9 w-full bg-background text-sm">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
                          {cat.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <dl className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Creada por</dt>
                  <dd className="truncate font-medium">{authorName(author)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Fecha</dt>
                  <dd className="font-medium">{format(new Date(task.created_at), "d MMM yyyy, HH:mm", { locale: es })}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Actividad</dt>
                  <dd className="font-medium">
                    {task.subtasks.length} subtareas · {task.comments.length} comentarios
                  </dd>
                </div>
              </dl>

              <Button
                variant="outline"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar tarea
              </Button>
            </aside>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarea</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todos los comentarios, subtareas y archivos adjuntos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
