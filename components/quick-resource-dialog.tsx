'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Copy, Loader2, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { parseQuickPaste, type QuickDraft } from '@/lib/quick-resource'
import { imageTypeFromUrl } from '@/lib/image-links'
import { VIDEO_TYPE } from '@/lib/youtube'
import { typeLabels } from '@/lib/resource-config'
import { priorityLabels } from '@/lib/priority-config'
import type { ResourceType, TaskPriority } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Fields = {
  title: string
  url: string
  downloadUrl: string
  description: string
  tags: string
  resourceType: ResourceType
  priority: TaskPriority
}

const emptyFields: Fields = { title: '', url: '', downloadUrl: '', description: '', tags: '', resourceType: 'script', priority: 'medium' }

/** Código del marcador del navegador: abre esta ventana con la página actual (y el texto seleccionado) ya rellenada. */
const bookmarkletCode = () =>
  `javascript:(function(){var s=String(window.getSelection?window.getSelection():'').slice(0,800);` +
  `window.open('${window.location.origin}/resources?add='+encodeURIComponent(location.href+'\\n'+document.title+(s?'\\n'+s:'')),'_blank')})()`

/**
 * Guardado rápido de recursos, disponible desde cualquier página (botón "Recurso" de la cabecera).
 * Se pega un enlace o un texto con enlaces y el formulario se rellena solo; Ctrl+Enter guarda.
 * Lo que necesite más cuidado (subir archivos o imágenes) se completa luego con "Editar".
 */
export function QuickResourceDialog({
  open,
  onOpenChange,
  initialText = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialText?: string
}) {
  const [supabase] = useState(() => createClient())
  const router = useRouter()
  const pathname = usePathname()
  const [text, setText] = useState('')
  const [fields, setFields] = useState<Fields>(emptyFields)
  const [edited, setEdited] = useState<Partial<Record<keyof Fields, boolean>>>({})
  const [images, setImages] = useState<QuickDraft['images']>([])
  const [videos, setVideos] = useState<QuickDraft['videos']>([])
  const [saving, setSaving] = useState(false)

  // Pega/escribe → se vuelve a analizar. Lo que la persona ya haya tocado a mano no se pisa.
  const analyze = (value: string, touched: typeof edited) => {
    setText(value)
    const draft = parseQuickPaste(value)
    setImages(draft.images)
    setVideos(draft.videos)
    setFields((prev) => ({
      ...prev,
      title: touched.title ? prev.title : draft.title,
      url: touched.url ? prev.url : draft.url,
      downloadUrl: touched.downloadUrl ? prev.downloadUrl : draft.downloadUrl,
      description: touched.description ? prev.description : draft.description,
      resourceType: touched.resourceType ? prev.resourceType : draft.resourceType,
    }))
  }

  const reset = (value: string) => {
    setEdited({})
    setFields(emptyFields)
    setImages([])
    setVideos([])
    setText('')
    if (value) analyze(value, {})
  }

  useEffect(() => {
    if (open) reset(initialText)
    // Solo al abrir: initialText se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const edit = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setEdited((prev) => ({ ...prev, [key]: true }))
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const save = async (addAnother: boolean) => {
    const title = fields.title.trim()
    if (!title || saving) return
    setSaving(true)
    let createdId: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.')

      const { data: resource, error } = await supabase
        .from('resources')
        .insert({
          title,
          description: fields.description.trim() || null,
          resource_type: fields.resourceType,
          status: 'pending',
          priority: fields.priority,
          url: fields.url.trim() || null,
          download_url: fields.downloadUrl.trim() || null,
          tags: fields.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          notes: null,
          updated_at: new Date().toISOString(),
          user_id: user.id,
        })
        .select()
        .single()
      if (error) throw error
      createdId = resource.id as string

      // Imágenes por enlace (la primera es la portada) y vídeos: solo se guarda la dirección.
      const rows = [
        ...images.map((image, index) => ({
          resource_id: resource.id,
          user_id: user.id,
          file_name: image.name,
          file_path: image.url,
          file_type: imageTypeFromUrl(image.url),
          file_size: 0,
          position: index,
          is_banner: index === 0,
        })),
        ...videos.map((video, index) => ({
          resource_id: resource.id,
          user_id: user.id,
          file_name: 'Vídeo de YouTube',
          file_path: video.url,
          file_type: VIDEO_TYPE,
          file_size: 0,
          position: images.length + index,
          is_banner: false,
        })),
      ]
      let attachments: unknown[] = []
      if (rows.length) {
        const { data, error: attachmentsError } = await supabase.from('resource_attachments').insert(rows).select()
        if (attachmentsError) throw attachmentsError
        attachments = data ?? []
      }

      // Si estás en Recursos, la lista se actualiza sin recargar.
      window.dispatchEvent(new CustomEvent('resource-created', { detail: { ...resource, resource_attachments: attachments } }))
      toast.success(`Recurso guardado: ${title}`, pathname.startsWith('/resources')
        ? undefined
        : { action: { label: 'Ver recursos', onClick: () => router.push('/resources') } })

      if (addAnother) {
        reset('')
        document.getElementById('quick-resource-text')?.focus()
      } else {
        onOpenChange(false)
      }
    } catch (error) {
      // Igual que el formulario completo: si algo falla a medias, no se deja un recurso huérfano.
      if (createdId) await supabase.from('resources').delete().eq('id', createdId)
      const message = (error as { message?: string } | null)?.message
      toast.error(message || 'No se pudo guardar el recurso')
    } finally {
      setSaving(false)
    }
  }

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletCode())
      toast.success('Marcador copiado. Pégalo como dirección de un marcador nuevo.')
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            void save(false)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Guardar recurso rápido</DialogTitle>
          <DialogDescription>Pega un enlace, o un texto con enlaces, y el formulario se rellena solo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            id="quick-resource-text"
            autoFocus
            rows={4}
            value={text}
            onChange={(event) => analyze(event.target.value, edited)}
            placeholder={'Pega aquí enlaces o texto.\nPor ejemplo: un repositorio de GitHub, enlaces de imágenes de imgur, un vídeo de YouTube, un enlace de descarga…'}
          />

          {(images.length > 0 || videos.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {images.map((image, index) => (
                <div key={image.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.name} referrerPolicy="no-referrer" className="h-14 w-24 rounded-md border border-border/70 object-cover" />
                  {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white">Portada</span>}
                  <button
                    type="button"
                    aria-label={`Quitar imagen ${image.name}`}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border hover:text-foreground"
                    onClick={() => setImages((current) => current.filter((item) => item.url !== image.url))}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {videos.map((video) => (
                <span key={video.ref.id} className="flex h-14 items-center gap-2 rounded-md border border-border/70 px-3 text-xs text-muted-foreground">
                  <Video className="size-4 text-red-400" />
                  Vídeo {video.ref.id}
                  <button
                    type="button"
                    aria-label="Quitar vídeo"
                    className="hover:text-foreground"
                    onClick={() => setVideos((current) => current.filter((item) => item.ref.id !== video.ref.id))}
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="quick-title">Título</Label>
              <Input id="quick-title" value={fields.title} onChange={(event) => edit('title', event.target.value)} placeholder="Nombre del recurso" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <Select value={fields.resourceType} onValueChange={(value) => edit('resourceType', value as ResourceType)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Prioridad</Label>
              <Select value={fields.priority} onValueChange={(value) => edit('priority', value as TaskPriority)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-url">Referencia</Label>
              <Input id="quick-url" value={fields.url} onChange={(event) => edit('url', event.target.value)} placeholder="https://github.com/…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quick-download">Descarga</Label>
              <Input id="quick-download" value={fields.downloadUrl} onChange={(event) => edit('downloadUrl', event.target.value)} placeholder="https://…" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="quick-tags">Etiquetas <span className="font-normal text-muted-foreground">(separadas por comas)</span></Label>
              <Input id="quick-tags" value={fields.tags} onChange={(event) => edit('tags', event.target.value)} placeholder="qbcore, inventario" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="quick-description">Descripción</Label>
              <Textarea id="quick-description" rows={2} value={fields.description} onChange={(event) => edit('description', event.target.value)} />
            </div>
          </div>

          <details className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Guardar desde cualquier web, sin abrir esta página</summary>
            <div className="mt-2 space-y-2 text-muted-foreground">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Pulsa el botón de abajo para copiar el marcador.</li>
                <li>Crea un marcador nuevo en tu navegador (Ctrl+D) y pega el texto copiado como <strong className="font-medium text-foreground">dirección</strong>.</li>
                <li>En cualquier web, haz clic en ese marcador: se abre esta ventana con la página ya rellenada. Si antes seleccionas texto, se usa como descripción.</li>
              </ol>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyBookmarklet()}>
                <Copy className="size-4" />
                Copiar marcador
              </Button>
            </div>
          </details>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground">Ctrl+Enter para guardar</span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={saving || !fields.title.trim()} onClick={() => void save(true)}>
              Guardar y añadir otro
            </Button>
            <Button type="button" disabled={saving || !fields.title.trim()} onClick={() => void save(false)}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
