'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Copy, ImagePlus, Loader2, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { mergeMedia, parseQuickPaste } from '@/lib/quick-resource'
import { imageNameFromUrl, imageTypeFromUrl, normalizeImageUrl } from '@/lib/image-links'
import { joinDownloadLinks, parseDownloadLinks } from '@/lib/download-links'
import { uploadImageToImgur } from '@/lib/imgur-upload'
import { VIDEO_TYPE, parseYouTube, youTubeWatchUrl, type YouTubeRef } from '@/lib/youtube'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGES, typeLabels } from '@/lib/resource-config'
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
type QuickImage = { url: string; name: string }
type QuickVideo = { url: string; ref: YouTubeRef }
type Uploading = { id: string; name: string; preview: string }

const emptyFields: Fields = { title: '', url: '', downloadUrl: '', description: '', tags: '', resourceType: 'script', priority: 'medium' }
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Código del marcador del navegador: abre esta ventana con la página actual (y el texto seleccionado) ya rellenada. */
const bookmarkletCode = () =>
  `javascript:(function(){var s=String(window.getSelection?window.getSelection():'').slice(0,800);` +
  `window.open('${window.location.origin}/resources?add='+encodeURIComponent(location.href+'\\n'+document.title+(s?'\\n'+s:'')),'_blank')})()`

/**
 * Guardado rápido de recursos, disponible desde cualquier página (botón "Recurso" de la cabecera).
 *  · Se pega un enlace o un texto con enlaces y el formulario se rellena solo.
 *  · Se arrastran imágenes (o se pegan capturas con Ctrl+V): se suben a Imgur y se guarda su enlace.
 *  · Hay campos para pegar enlaces de imágenes (Imgur…) y de vídeos de YouTube.
 *  · Ctrl+Enter guarda. Lo que necesite más cuidado (archivos) se completa luego con "Editar".
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
  const [detected, setDetected] = useState<{ images: QuickImage[]; videos: QuickVideo[] }>({ images: [], videos: [] })
  const [manualImages, setManualImages] = useState<QuickImage[]>([])
  const [manualVideos, setManualVideos] = useState<QuickVideo[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [uploading, setUploading] = useState<Uploading[]>([])
  const [dragging, setDragging] = useState(false)
  const [imageLink, setImageLink] = useState('')
  const [videoLink, setVideoLink] = useState('')
  const [saving, setSaving] = useState(false)
  const session = useRef(0)

  // Imágenes y vídeos finales: los añadidos a mano primero (la primera imagen es la portada).
  const images = useMemo(() => mergeMedia(manualImages, detected.images, (item) => item.url, removed), [manualImages, detected.images, removed])
  const videos = useMemo(() => mergeMedia(manualVideos, detected.videos, (item) => item.url, removed), [manualVideos, detected.videos, removed])

  // Pega/escribe → se vuelve a analizar. Lo que la persona ya haya tocado a mano no se pisa.
  const analyze = (value: string, touched: typeof edited) => {
    setText(value)
    const draft = parseQuickPaste(value)
    setDetected({ images: draft.images, videos: draft.videos })
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
    session.current += 1 // las subidas que estuvieran en curso ya no se añadirán
    setEdited({})
    setFields(emptyFields)
    setDetected({ images: [], videos: [] })
    setManualImages([])
    setManualVideos([])
    setRemoved([])
    setImageLink('')
    setVideoLink('')
    setUploading([])
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

  const dropRemoved = (id: string) => setRemoved((current) => current.filter((item) => item !== id))

  // ---------- imágenes: arrastrar, pegar captura o elegir archivo → Imgur ----------
  const uploadFiles = async (source: FileList | File[] | null) => {
    const files = Array.from(source ?? []).filter((file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(file.name))
    if (!files.length) return
    const room = MAX_IMAGES - images.length - uploading.length
    if (room <= 0) {
      toast.error(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes por recurso.`)
      return
    }
    if (files.length > room) toast.warning(`Solo caben ${room} imágenes más (máximo ${MAX_IMAGES}).`)
    const current = session.current

    await Promise.all(files.slice(0, room).map(async (file) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name} no es una imagen JPG, PNG, WebP o GIF.`)
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} supera el límite de 8 MB.`)
        return
      }
      const id = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      setUploading((list) => [...list, { id, name: file.name, preview }])
      try {
        const result = await uploadImageToImgur(file)
        if (current !== session.current) return
        setManualImages((list) => (list.some((item) => item.url === result.url) ? list : [...list, { url: result.url, name: file.name }]))
        dropRemoved(result.url)
      } catch (error) {
        if (current === session.current) {
          toast.error(`No se pudo subir ${file.name} a Imgur: ${error instanceof Error ? error.message : 'error desconocido'}`)
        }
      } finally {
        URL.revokeObjectURL(preview)
        setUploading((list) => list.filter((item) => item.id !== id))
      }
    }))
  }

  // ---------- enlaces sueltos de imagen (Imgur…) y de YouTube ----------
  const addImageLink = () => {
    const value = imageLink.trim()
    if (!value) return
    const normalized = normalizeImageUrl(value)
    if ('error' in normalized) {
      toast.error(normalized.error)
      return
    }
    if (images.some((item) => item.url === normalized.url)) {
      toast.info('Esa imagen ya está añadida.')
      return
    }
    if (images.length + uploading.length >= MAX_IMAGES) {
      toast.error(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes por recurso.`)
      return
    }
    setManualImages((list) => [...list, { url: normalized.url, name: imageNameFromUrl(normalized.url) }])
    dropRemoved(normalized.url)
    setImageLink('')
  }

  const addVideoLink = () => {
    const value = videoLink.trim()
    if (!value) return
    const ref = parseYouTube(value)
    if (!ref) {
      toast.error('Ese enlace no es de un vídeo de YouTube.')
      return
    }
    const url = youTubeWatchUrl(ref)
    if (videos.some((item) => item.ref.id === ref.id)) {
      toast.info('Ese vídeo ya está añadido.')
      return
    }
    setManualVideos((list) => [...list, { url, ref }])
    dropRemoved(url)
    setVideoLink('')
  }

  const save = async (addAnother: boolean) => {
    const title = fields.title.trim()
    if (!title || saving || uploading.length > 0) return
    setSaving(true)
    let createdId: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.')
      if (fields.downloadUrl.trim() && parseDownloadLinks(fields.downloadUrl).length === 0) {
        throw new Error('Los enlaces de descarga tienen que empezar por http:// o https:// (uno por línea).')
      }

      const { data: resource, error } = await supabase
        .from('resources')
        .insert({
          title,
          description: fields.description.trim() || null,
          resource_type: fields.resourceType,
          status: 'pending',
          priority: fields.priority,
          url: fields.url.trim() || null,
          download_url: joinDownloadLinks(fields.downloadUrl),
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

  const busy = saving || uploading.length > 0
  const hasMedia = images.length > 0 || videos.length > 0 || uploading.length > 0

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
        // Capturas pegadas con Ctrl+V desde cualquier punto de la ventana.
        onPaste={(event) => {
          const pasted = Array.from<File>(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))
          if (!pasted.length) return
          event.preventDefault()
          void uploadFiles(pasted)
        }}
        // Soltar imágenes en cualquier punto de la ventana (si no, el navegador abriría la imagen).
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes('Files')) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          setDragging(false)
          if (!event.dataTransfer.files.length) return
          event.preventDefault()
          void uploadFiles(event.dataTransfer.files)
        }}
      >
        <DialogHeader>
          <DialogTitle>Guardar recurso rápido</DialogTitle>
          <DialogDescription>Pega un enlace o un texto con enlaces, y arrastra o pega imágenes: se suben a Imgur.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            id="quick-resource-text"
            autoFocus
            rows={3}
            value={text}
            onChange={(event) => analyze(event.target.value, edited)}
            placeholder={'Pega aquí enlaces o texto.\nPor ejemplo: un repositorio de GitHub, un enlace de descarga, un vídeo de YouTube…'}
          />

          <div className="space-y-2">
            <label
              htmlFor="quick-images"
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
                dragging ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <ImagePlus className="size-4" />
              Arrastra imágenes, pégalas con Ctrl+V o haz clic · se suben a Imgur
              <input
                id="quick-images"
                type="file"
                accept={ALLOWED_IMAGE_TYPES.join(',')}
                multiple
                className="sr-only"
                onChange={(event) => {
                  void uploadFiles(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
              />
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex gap-2">
                <Input
                  value={imageLink}
                  onChange={(event) => setImageLink(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                      event.preventDefault()
                      addImageLink()
                    }
                  }}
                  placeholder="Enlace de imagen (imgur…)"
                  aria-label="Pegar enlace de imagen"
                />
                <Button type="button" variant="outline" onClick={addImageLink} disabled={!imageLink.trim()}>Añadir</Button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={videoLink}
                  onChange={(event) => setVideoLink(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                      event.preventDefault()
                      addVideoLink()
                    }
                  }}
                  placeholder="Enlace de YouTube"
                  aria-label="Pegar enlace de vídeo de YouTube"
                />
                <Button type="button" variant="outline" onClick={addVideoLink} disabled={!videoLink.trim()}>Añadir</Button>
              </div>
            </div>
          </div>

          {hasMedia && (
            <div className="flex flex-wrap gap-2">
              {images.map((image, index) => (
                <div key={image.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.name} referrerPolicy="no-referrer" className="aspect-video h-14 rounded-md border border-border/70 object-cover" />
                  {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] text-white">Portada</span>}
                  <button
                    type="button"
                    aria-label={`Quitar imagen ${image.name}`}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border hover:text-foreground"
                    onClick={() => setRemoved((current) => [...current, image.url])}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {uploading.map((item) => (
                <div key={item.id} className="relative" role="status" aria-label={`Subiendo ${item.name} a Imgur`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.preview} alt="" className="aspect-video h-14 rounded-md border border-border/70 object-cover opacity-50" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-foreground" />
                  </span>
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
                    onClick={() => setRemoved((current) => [...current, video.url])}
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
              <Label htmlFor="quick-download">Descarga <span className="font-normal text-muted-foreground">(uno por línea)</span></Label>
              <Textarea id="quick-download" rows={2} value={fields.downloadUrl} onChange={(event) => edit('downloadUrl', event.target.value)} placeholder={'https://…'} />
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
              <p>Mejor con la extensión del navegador (un clic). Si prefieres un marcador:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Pulsa el botón de abajo para copiar el marcador.</li>
                <li>Crea un marcador nuevo en tu navegador (Ctrl+D) y pega el texto copiado como <strong className="font-medium text-foreground">dirección</strong>.</li>
                <li>En cualquier web, haz clic en ese marcador: se abre esta ventana con la página ya rellenada.</li>
              </ol>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyBookmarklet()}>
                <Copy className="size-4" />
                Copiar marcador
              </Button>
            </div>
          </details>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="self-center text-xs text-muted-foreground" role="status">
            {uploading.length > 0 ? `Subiendo ${uploading.length} ${uploading.length === 1 ? 'imagen' : 'imágenes'} a Imgur…` : 'Ctrl+Enter para guardar'}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" disabled={busy || !fields.title.trim()} onClick={() => void save(true)}>
              Guardar y añadir otro
            </Button>
            <Button type="button" disabled={busy || !fields.title.trim()} onClick={() => void save(false)}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
