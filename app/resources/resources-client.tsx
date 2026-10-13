'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Resource, ResourceAttachment, ResourceType } from '@/lib/types'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Bookmark, Download, ExternalLink, ImagePlus, Link2, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'

const typeLabels: Record<ResourceType, string> = { script: 'Script', mlo: 'MLO', vehicle: 'Vehículo', map: 'Mapa', ui: 'UI', tool: 'Herramienta', other: 'Otro' }
const typeColors: Record<ResourceType, string> = { script: 'bg-primary/10 text-primary', mlo: 'bg-violet-500/10 text-violet-300', vehicle: 'bg-amber-500/10 text-amber-300', map: 'bg-sky-500/10 text-sky-300', ui: 'bg-pink-500/10 text-pink-300', tool: 'bg-orange-500/10 text-orange-300', other: 'bg-muted text-muted-foreground' }
const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const MAX_IMAGES = 8
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

type ResourceWithAttachments = Resource & { resource_attachments?: ResourceAttachment[] }
type DraftImage = { file: File; previewUrl: string; id: string }
type ResourceForm = { title: string; description: string; resource_type: ResourceType; url: string; download_url: string; tags: string; notes: string }

const emptyForm: ResourceForm = { title: '', description: '', resource_type: 'script', url: '', download_url: '', tags: '', notes: '' }
const imageUrl = (path: string) => path.startsWith('r2/') ? `/api/file?pathname=${encodeURIComponent(path)}` : path

async function deleteStoredFile(pathname: string) {
  try {
    const response = await fetch('/api/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pathname }),
    })
    return response.ok
  } catch {
    return false
  }
}

async function isSupportedImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return false
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const isGif = String.fromCharCode(...bytes.slice(0, 6)).startsWith('GIF8')
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return (file.type === 'image/jpeg' && isJpeg) ||
    (file.type === 'image/png' && isPng) ||
    (file.type === 'image/gif' && isGif) ||
    (file.type === 'image/webp' && isWebp)
}

export function ResourcesClient({ profile, initialResources }: { profile: Profile | null; initialResources: ResourceWithAttachments[] }) {
  const supabase = createClient()
  const [resources, setResources] = useState(initialResources)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | ResourceType>('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ResourceWithAttachments | null>(null)
  const [form, setForm] = useState<ResourceForm>(emptyForm)
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([])
  const [bannerId, setBannerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [draggingImages, setDraggingImages] = useState(false)
  const previewUrls = useRef<string[]>([])

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  useEffect(() => {
    if (!open) return
    const preventFileNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.files.length) event.preventDefault()
    }
    window.addEventListener('drop', preventFileNavigation)
    return () => window.removeEventListener('drop', preventFileNavigation)
  }, [open])

  const filtered = useMemo(() => resources.filter((item) => {
    const haystack = `${item.title} ${item.description ?? ''} ${item.tags.join(' ')}`.toLowerCase()
    return (type === 'all' || item.resource_type === type) && haystack.includes(query.toLowerCase())
  }), [resources, query, type])

  const resetEditor = () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current = []
    setForm(emptyForm)
    setDraftImages([])
    setRemovedImageIds([])
    setBannerId('')
    setEditing(null)
    setUploadError('')
  }

  const openNewResource = () => {
    resetEditor()
    setOpen(true)
  }

  const openEditResource = (resource: ResourceWithAttachments) => {
    resetEditor()
    setEditing(resource)
    setForm({
      title: resource.title,
      description: resource.description ?? '',
      resource_type: resource.resource_type,
      url: resource.url ?? '',
      download_url: resource.download_url ?? '',
      tags: resource.tags.join(', '),
      notes: resource.notes ?? '',
    })
    const currentBanner = resource.resource_attachments?.find((attachment) => attachment.is_banner)
    setBannerId(currentBanner?.id ?? '')
    setOpen(true)
  }

  const onDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return
    if (!nextOpen) resetEditor()
    setOpen(nextOpen)
  }

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploadError('')
    const activeImages = (editing?.resource_attachments ?? []).filter((attachment) => !removedImageIds.includes(attachment.id)).length + draftImages.length
    const picked = Array.from(files)
    if (activeImages + picked.length > MAX_IMAGES) {
      setUploadError(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes por recurso.`)
      return
    }

    const valid: DraftImage[] = []
    for (const file of picked) {
      if (file.size > MAX_IMAGE_SIZE) {
        setUploadError(`${file.name} supera el límite de 8 MB.`)
        continue
      }
      if (!await isSupportedImage(file)) {
        setUploadError(`${file.name} no es una imagen JPG, PNG, WebP o GIF válida.`)
        continue
      }
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.push(previewUrl)
      valid.push({ file, previewUrl, id: `new:${crypto.randomUUID()}` })
    }
    setDraftImages((current) => [...current, ...valid])
    if (valid.length) setBannerId((current) => current || valid[0].id)
  }

  const removeDraftImage = (image: DraftImage) => {
    URL.revokeObjectURL(image.previewUrl)
    previewUrls.current = previewUrls.current.filter((url) => url !== image.previewUrl)
    setDraftImages((current) => current.filter((item) => item.id !== image.id))
    if (bannerId === image.id) setBannerId('')
  }

  const removeExistingImage = (attachment: ResourceAttachment) => {
    setRemovedImageIds((current) => [...current, attachment.id])
    if (bannerId === attachment.id) setBannerId('')
  }

  const saveResource = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) return setUploadError('Añade un título.')
    const existingImages = (editing?.resource_attachments ?? []).filter((attachment) => !removedImageIds.includes(attachment.id))
    const imageCount = existingImages.length + draftImages.length
    if (imageCount && !bannerId) return setUploadError('Selecciona una imagen de portada antes de guardar.')
    if (imageCount > MAX_IMAGES) return setUploadError(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes por recurso.`)

    setSaving(true)
    setUploadError('')
    const uploadedKeys: string[] = []
    let createdResourceId: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.')

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        resource_type: form.resource_type,
        url: form.url.trim() || null,
        download_url: form.download_url.trim() || null,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      let resourceId = editing?.id
      if (!editing) {
        const { data, error } = await supabase.from('resources').insert({ ...payload, user_id: user.id }).select().single()
        if (error) throw error
        resourceId = data.id
        createdResourceId = data.id
      }
      if (!resourceId) throw new Error('No se pudo identificar el recurso guardado.')

      const uploadedAttachments: Omit<ResourceAttachment, 'id' | 'created_at'>[] = []
      const uploadedFilePaths = new Map<string, string>()
      for (const [index, image] of draftImages.entries()) {
        const signResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: image.file.name, contentType: image.file.type, fileSize: image.file.size, purpose: 'resource-image' }),
        })
        const signed = await signResponse.json()
        if (!signResponse.ok) throw new Error(signed.error || `No se pudo preparar la carga de ${image.file.name}.`)

        uploadedKeys.push(signed.key)
        uploadedFilePaths.set(image.id, signed.key)
        const uploadResponse = await fetch(signed.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': image.file.type },
          body: image.file,
        })
        if (!uploadResponse.ok) throw new Error(`No se pudo subir ${image.file.name}. Inténtalo de nuevo.`)
        uploadedAttachments.push({
          resource_id: resourceId,
          user_id: user.id,
          file_name: image.file.name,
          file_path: signed.key,
          file_type: image.file.type,
          file_size: image.file.size,
          position: existingImages.length + index,
          is_banner: false,
        })
      }

      if (uploadedAttachments.length) {
        const { error } = await supabase.from('resource_attachments').insert(uploadedAttachments)
        if (error) throw error
      }

      if (editing) {
        const { error } = await supabase.from('resources').update(payload)
          .eq('id', editing.id).eq('user_id', user.id).select().single()
        if (error) throw error
        if (existingImages.length) {
          const { error } = await supabase.from('resource_attachments').update({ is_banner: false })
            .eq('resource_id', resourceId).eq('user_id', user.id)
          if (error) throw error
        }
        for (const [position, attachment] of existingImages.entries()) {
          const { error } = await supabase.from('resource_attachments')
            .update({ position, is_banner: false })
            .eq('id', attachment.id).eq('resource_id', resourceId).eq('user_id', user.id)
          if (error) throw error
        }

        if (removedImageIds.length) {
          const removed = (editing.resource_attachments ?? []).filter((attachment) => removedImageIds.includes(attachment.id))
          const { error } = await supabase.from('resource_attachments').delete()
            .in('id', removedImageIds).eq('resource_id', resourceId).eq('user_id', user.id)
          if (error) throw error
          for (const attachment of removed) {
            if (!await deleteStoredFile(attachment.file_path)) toast.error(`No se pudo limpiar el archivo ${attachment.file_name}.`)
          }
        }
      }

      const selectedBanner = bannerId.startsWith('new:')
        ? draftImages.find((image) => image.id === bannerId)
        : existingImages.find((attachment) => attachment.id === bannerId)
      if (selectedBanner) {
        const path = selectedBanner.id.startsWith('new:') ? uploadedFilePaths.get(selectedBanner.id) : undefined
        if (selectedBanner.id.startsWith('new:') && !path) throw new Error('No se pudo localizar la imagen de portada.')
        const { error } = selectedBanner.id.startsWith('new:')
          ? await supabase.from('resource_attachments').update({ is_banner: true }).eq('file_path', path!).eq('resource_id', resourceId).eq('user_id', user.id)
          : await supabase.from('resource_attachments').update({ is_banner: true }).eq('id', selectedBanner.id).eq('resource_id', resourceId).eq('user_id', user.id)
        if (error) throw error
      }

      const { data: savedAttachments, error: attachmentsError } = await supabase.from('resource_attachments')
        .select('*').eq('resource_id', resourceId).order('position')
      if (attachmentsError) throw attachmentsError

      const savedResource = {
        ...(editing ?? { ...payload, user_id: user.id, created_at: new Date().toISOString() }),
        ...payload,
        id: resourceId,
        user_id: user.id,
        resource_attachments: savedAttachments ?? [],
      } as ResourceWithAttachments
      setResources((current) => editing
        ? current.map((resource) => resource.id === resourceId ? savedResource : resource)
        : [savedResource, ...current])
      resetEditor()
      setOpen(false)
      toast.success(editing ? 'Recurso actualizado' : 'Recurso guardado')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el recurso.'
      setUploadError(message)
      toast.error(message)
      let canCleanUploadedFiles = true
      if (uploadedKeys.length) {
        const { error: rollbackError } = await supabase.from('resource_attachments').delete().in('file_path', uploadedKeys)
        if (rollbackError) {
          canCleanUploadedFiles = false
          toast.error('No se pudieron revertir los datos de las imágenes. Los archivos se conservarán para evitar enlaces rotos.')
        }
      }
      if (createdResourceId) {
        const { error: rollbackError } = await supabase.from('resources').delete().eq('id', createdResourceId)
        if (rollbackError) {
          canCleanUploadedFiles = false
          toast.error('No se pudo revertir el recurso nuevo; las imágenes se conservarán para evitar enlaces rotos.')
        }
      }
      if (canCleanUploadedFiles) {
        for (const key of uploadedKeys) {
          if (!await deleteStoredFile(key)) toast.error('No se pudo limpiar una imagen subida. Contacta con soporte.')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  const removeResource = async (resource: ResourceWithAttachments) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return toast.error('Sesión no disponible')
    const { error } = await supabase.from('resources').delete().eq('id', resource.id).eq('user_id', user.id)
    if (error) return toast.error('No se pudo eliminar el recurso')
    setResources((current) => current.filter((item) => item.id !== resource.id))
    const cleanupResults = await Promise.all((resource.resource_attachments ?? []).map((attachment) => deleteStoredFile(attachment.file_path)))
    toast.success('Recurso eliminado')
    if (cleanupResults.some((success) => !success)) toast.error('No se pudieron limpiar todas las imágenes del recurso.')
  }

  const activeAttachments = (editing?.resource_attachments ?? []).filter((attachment) => !removedImageIds.includes(attachment.id))

  return <div className="min-h-screen bg-background"><Header profile={profile} /><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-primary"><Bookmark className="size-4" /><span className="text-sm font-medium uppercase tracking-wider">Biblioteca privada</span></div><h1 className="text-3xl font-bold tracking-tight">Recursos FiveM</h1><p className="mt-2 text-muted-foreground">Guarda referencias, enlaces y descargas de tus recursos autorizados.</p></div>
      <Dialog open={open} onOpenChange={onDialogOpenChange}>
        <DialogTrigger asChild><Button onClick={openNewResource}><Plus data-icon="inline-start" />Añadir recurso</Button></DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar recurso' : 'Nuevo recurso'}</DialogTitle></DialogHeader>
          <form onSubmit={saveResource}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2"><Label htmlFor="resource-title">Título</Label><Input id="resource-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Inventario avanzado" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2"><Label>Tipo</Label><Select value={form.resource_type} onValueChange={(value) => setForm({ ...form, resource_type: value as ResourceType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex flex-col gap-2"><Label>Etiquetas</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="qbcore, ui" /></div>
              </div>
              <div className="flex flex-col gap-2"><Label htmlFor="resource-description">Descripción</Label><Textarea id="resource-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Qué contiene y para qué sirve..." /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="resource-url">Enlace de referencia</Label><Input id="resource-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="resource-download">Enlace de descarga</Label><Input id="resource-download" type="url" value={form.download_url} onChange={(e) => setForm({ ...form, download_url: e.target.value })} placeholder="https://..." /></div>
              <div className="flex flex-col gap-2"><Label htmlFor="resource-notes">Notas privadas</Label><Textarea id="resource-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Dependencias, versión, instalación..." /></div>
              <section className="flex flex-col gap-2" aria-labelledby="resource-images-title">
                <div><Label id="resource-images-title">Imágenes</Label><p className="mt-1 text-xs text-muted-foreground">Hasta {MAX_IMAGES} imágenes, 8 MB cada una. JPG, PNG, WebP o GIF.</p></div>
                <label
                  htmlFor="resource-images"
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${draggingImages ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'}`}
                  onDragEnter={(event) => {
                    if (Array.from(event.dataTransfer.types).includes('Files')) setDraggingImages(true)
                  }}
                  onDragOver={(event) => {
                    if (!Array.from(event.dataTransfer.types).includes('Files')) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                    setDraggingImages(true)
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingImages(false)
                  }}
                  onDrop={(event) => {
                    setDraggingImages(false)
                    if (!event.dataTransfer.files.length) return
                    event.preventDefault()
                    void addFiles(event.dataTransfer.files)
                  }}
                >
                  <ImagePlus className="size-4" />Arrastra imágenes aquí o haz clic para seleccionarlas
                  <span className="sr-only" aria-live="polite">{draggingImages ? 'Suelta las imágenes para adjuntarlas.' : ''}</span>
                  <input id="resource-images" type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} multiple className="sr-only" onChange={(event) => { void addFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
                </label>
                {(activeAttachments.length + draftImages.length > 0) && <p className="text-xs text-muted-foreground">Selecciona una portada. El resto aparecerá como miniaturas enlazadas.</p>}
                <div className="grid grid-cols-3 gap-2">
                  {activeAttachments.map((attachment) => (
                    <div key={attachment.id} className={`relative overflow-hidden rounded-md border ${bannerId === attachment.id ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                      <button type="button" className="block w-full text-left" onClick={() => setBannerId(attachment.id)} aria-label={`Usar ${attachment.file_name} como portada`} aria-pressed={bannerId === attachment.id}>
                        <img src={imageUrl(attachment.file_path)} alt={attachment.file_name} className="aspect-[4/3] w-full object-cover" />
                        <span className="block truncate px-2 py-1 text-[11px]">{bannerId === attachment.id ? 'Portada' : 'Elegir portada'}</span>
                      </button>
                      <Button type="button" variant="secondary" size="icon-sm" className="absolute right-1 top-1 size-7" aria-label={`Quitar ${attachment.file_name}`} onClick={() => removeExistingImage(attachment)}><X className="size-3.5" /></Button>
                    </div>
                  ))}
                  {draftImages.map((image) => (
                    <div key={image.id} className={`relative overflow-hidden rounded-md border ${bannerId === image.id ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                      <button type="button" className="block w-full text-left" onClick={() => setBannerId(image.id)} aria-label={`Usar ${image.file.name} como portada`} aria-pressed={bannerId === image.id}>
                        <img src={image.previewUrl} alt={image.file.name} className="aspect-[4/3] w-full object-cover" />
                        <span className="block truncate px-2 py-1 text-[11px]">{bannerId === image.id ? 'Portada' : 'Elegir portada'}</span>
                      </button>
                      <Button type="button" variant="secondary" size="icon-sm" className="absolute right-1 top-1 size-7" aria-label={`Quitar ${image.file.name}`} onClick={() => removeDraftImage(image)}><X className="size-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </section>
              {uploadError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{uploadError}</p>}
            </div>
            <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => onDialogOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar recurso'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar recursos, etiquetas..." /></div><Select value={type} onValueChange={(value) => setType(value as typeof type)}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los tipos</SelectItem>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => {
      const attachments = (item.resource_attachments ?? []).slice().sort((a, b) => a.position - b.position)
      const banner = attachments.find((attachment) => attachment.is_banner)
      const thumbnails = attachments.filter((attachment) => attachment.id !== banner?.id)
      return <Card key={item.id} className="group overflow-hidden border-border/60 bg-card/70">
        {banner && <a href={imageUrl(banner.file_path)} target="_blank" rel="noreferrer" aria-label={`Abrir portada de ${item.title}`}><img src={imageUrl(banner.file_path)} alt={`Portada: ${item.title}`} className="aspect-[16/8] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /></a>}
        <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><Badge className={typeColors[item.resource_type]}>{typeLabels[item.resource_type]}</Badge><CardTitle className="mt-3 text-lg">{item.title}</CardTitle></div><div className="flex shrink-0 items-center"><Button variant="ghost" size="icon" onClick={() => openEditResource(item)} aria-label={`Editar ${item.title}`}><Pencil className="size-4 text-muted-foreground" /></Button><Button variant="ghost" size="icon" onClick={() => void removeResource(item)} aria-label={`Eliminar ${item.title}`}><Trash2 className="size-4 text-muted-foreground" /></Button></div></div><CardDescription className="line-clamp-2">{item.description || 'Sin descripción'}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {thumbnails.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Más imágenes del recurso">{thumbnails.map((attachment) => <a key={attachment.id} href={imageUrl(attachment.file_path)} target="_blank" rel="noreferrer" title={`Abrir ${attachment.file_name}`} className="shrink-0 overflow-hidden rounded-md border border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={imageUrl(attachment.file_path)} alt={attachment.file_name} className="size-14 object-cover transition-opacity hover:opacity-80" /></a>)}</div>}
          <div className="flex flex-wrap gap-1.5">{item.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>)}</div>
          <div className="flex items-center gap-2 border-t border-border/60 pt-3">{item.url && <Button asChild variant="outline" size="sm"><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Referencia</a></Button>}{item.download_url && <Button asChild size="sm"><a href={item.download_url} target="_blank" rel="noreferrer"><Download data-icon="inline-start" />Descarga</a></Button>}{!item.url && !item.download_url && <span className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="size-3.5" />Sin enlaces</span>}</div>
        </CardContent>
      </Card>
    })}</div> : <div className="rounded-xl border border-dashed border-border p-12 text-center"><Bookmark className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="font-semibold">{resources.length ? 'No hay resultados' : 'Tu biblioteca está vacía'}</h2><p className="mt-1 text-sm text-muted-foreground">{resources.length ? 'Prueba con otra búsqueda o tipo de recurso.' : 'Añade enlaces, notas y referencias de recursos con licencia o autorización.'}</p>{!resources.length && <Button className="mt-4" onClick={openNewResource}><Plus data-icon="inline-start" />Añadir recurso</Button>}</div>}
  </main></div>
}
