'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Resource, ResourceAttachment, ResourceStatus, ResourceType } from '@/lib/types'
import { Header } from '@/components/header'
import { can, type Role } from '@/lib/roles'
import { ALLOWED_IMAGE_TYPES, MAX_IMAGES, statusColors, statusLabels, typeColors, typeLabels } from '@/lib/resource-config'
import { VIDEO_TYPE, fetchYouTubeTitle, parseYouTube, youTubeWatchUrl, type YouTubeRef } from '@/lib/youtube'
import { YouTubeEmbed } from '@/components/youtube-embed'
import { canLoadImage, imageNameFromUrl, imageTypeFromUrl, normalizeImageUrl } from '@/lib/image-links'
import { ImageLightbox, type LightboxImage } from '@/components/image-lightbox'
import { ResourceDetailDialog } from '@/components/resource-detail-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Bookmark, Download, ExternalLink, FileText, ImagePlus, Link2, Loader2, Maximize2, Paperclip, Pencil, Plus, Search, Trash2, Video, X } from 'lucide-react'

const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const MAX_RESOURCE_FILE_SIZE = 700 * 1024 * 1024

type ResourceWithAttachments = Resource & { resource_attachments?: ResourceAttachment[] }
type DraftImage = { file: File; previewUrl: string; id: string }
type DraftResourceFile = { file: File; id: string }
type DraftLink = { id: string; url: string; name: string }
type DraftVideo = { id: string; ref: YouTubeRef; url: string; title: string }
type MultipartUpload = { key: string; uploadId: string; partSize: number }
type ResourceForm = { title: string; description: string; resource_type: ResourceType; status: ResourceStatus; url: string; download_url: string; tags: string; notes: string }

const emptyForm: ResourceForm = { title: '', description: '', resource_type: 'script', status: 'pending', url: '', download_url: '', tags: '', notes: '' }
const imageUrl = (path: string) => path.startsWith('r2/') ? `/api/file?pathname=${encodeURIComponent(path)}` : path

async function postUploadAction<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error || 'No se pudo continuar la carga a Cloudflare R2.')
  return result
}

function uploadMultipartPart(url: string, body: Blob, onProgress: (loaded: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded)
    })
    request.addEventListener('load', () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`R2 rechazó una parte de la carga (${request.status}).`))
        return
      }
      const etag = request.getResponseHeader('ETag')
      if (!etag) {
        reject(new Error('R2 no expuso el encabezado ETag. Configura CORS del bucket para exponer ETag.'))
        return
      }
      resolve(etag)
    })
    request.addEventListener('error', () => reject(new Error('Error de red al subir una parte del archivo a R2.')))
    request.addEventListener('abort', () => reject(new Error('La carga de una parte del archivo fue interrumpida.')))
    request.send(body)
  })
}

async function uploadResourceFile(
  file: File,
  multipart: MultipartUpload,
  onProgress: (percentage: number) => void,
) {
  const parts: { PartNumber: number; ETag: string }[] = []
  let completedBytes = 0
  const partCount = Math.ceil(file.size / multipart.partSize)

  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const start = (partNumber - 1) * multipart.partSize
    const part = file.slice(start, Math.min(start + multipart.partSize, file.size))
    let etag: string | undefined
    let lastError: Error | undefined

    for (let attempt = 0; attempt < 3 && !etag; attempt++) {
      try {
        const { uploadUrl } = await postUploadAction<{ uploadUrl: string }>({
          action: 'sign-part',
          key: multipart.key,
          uploadId: multipart.uploadId,
          partNumber,
        })
        etag = await uploadMultipartPart(uploadUrl, part, (loaded) => {
          onProgress(Math.min(100, Math.round(((completedBytes + loaded) / file.size) * 100)))
        })
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Error al subir una parte del archivo.')
      }
    }

    if (!etag) throw lastError ?? new Error(`No se pudo subir la parte ${partNumber}.`)
    parts.push({ PartNumber: partNumber, ETag: etag })
    completedBytes += part.size
    onProgress(Math.min(100, Math.round((completedBytes / file.size) * 100)))
  }

  await postUploadAction({ action: 'complete', key: multipart.key, uploadId: multipart.uploadId, parts })
}

async function deleteStoredFile(pathname: string) {
  // Imágenes y vídeos por enlace (p. ej. movidos desde una tarea) no están en R2: no hay nada que borrar.
  if (/^https?:\/\//i.test(pathname)) return true
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

export function ResourcesClient({ profile, role, initialResources }: { profile: Profile | null; role: Role; initialResources: ResourceWithAttachments[] }) {
  const supabase = createClient()
  // Admin: todo. Moderador: solo ver y leer (sin descargas, referencias ni edición).
  const canEdit = can.editResources(role)
  const canDownload = can.downloadResources(role)
  const canOpenReferences = can.openReferences(role)
  const [resources, setResources] = useState(initialResources)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | ResourceType>('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ResourceWithAttachments | null>(null)
  const [form, setForm] = useState<ResourceForm>(emptyForm)
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const [draftFiles, setDraftFiles] = useState<DraftResourceFile[]>([])
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([])
  const [draftLinks, setDraftLinks] = useState<DraftLink[]>([])
  const [draftVideos, setDraftVideos] = useState<DraftVideo[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [videoInput, setVideoInput] = useState('')
  const [checkingLink, setCheckingLink] = useState(false)
  const [detail, setDetail] = useState<ResourceWithAttachments | null>(null)
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null)
  const [bannerId, setBannerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
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
    setDraftFiles([])
    setDraftLinks([])
    setDraftVideos([])
    setLinkInput('')
    setVideoInput('')
    setRemovedAttachmentIds([])
    setBannerId('')
    setEditing(null)
    setUploadError('')
    setUploadProgress('')
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
      status: resource.status ?? 'pending',
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
    const activeImages = (editing?.resource_attachments ?? []).filter((attachment) =>
      ALLOWED_IMAGE_TYPES.includes(attachment.file_type) && !removedAttachmentIds.includes(attachment.id),
    ).length + draftImages.length + draftLinks.length
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
    setRemovedAttachmentIds((current) => [...current, attachment.id])
    if (bannerId === attachment.id) setBannerId('')
  }

  const addResourceFiles = (files: FileList | null) => {
    if (!files?.length) return
    setUploadError('')
    const valid: DraftResourceFile[] = []
    for (const file of Array.from(files)) {
      if (file.size > MAX_RESOURCE_FILE_SIZE) {
        setUploadError(`${file.name} supera el límite de 700 MB.`)
        continue
      }
      if (!file.size) {
        setUploadError(`${file.name} está vacío y no se puede adjuntar.`)
        continue
      }
      if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setUploadError(`${file.name} es una imagen. Añádela en la sección Imágenes para poder elegirla como portada.`)
        continue
      }
      valid.push({ file, id: `new-file:${crypto.randomUUID()}` })
    }
    setDraftFiles((current) => [...current, ...valid])
  }

  const removeDraftFile = (id: string) => {
    setDraftFiles((current) => current.filter((file) => file.id !== id))
  }

  const removeExistingFile = (attachment: ResourceAttachment) => {
    setRemovedAttachmentIds((current) => [...current, attachment.id])
  }

  const addImageLink = async () => {
    if (!linkInput.trim() || checkingLink) return
    setUploadError('')
    const normalized = normalizeImageUrl(linkInput)
    if ('error' in normalized) return setUploadError(normalized.error)
    const existingCount = activeImages.length + draftImages.length + draftLinks.length
    if (existingCount >= MAX_IMAGES) return setUploadError(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes por recurso.`)
    if (draftLinks.some((link) => link.url === normalized.url) || activeImages.some((image) => image.file_path === normalized.url)) {
      return setUploadError('Esa imagen ya está añadida.')
    }
    setCheckingLink(true)
    const ok = await canLoadImage(normalized.url)
    setCheckingLink(false)
    if (!ok) return setUploadError('No se pudo cargar una imagen desde ese enlace. Comprueba que es un enlace directo (por ejemplo https://i.imgur.com/abc123.png).')
    const id = `new:link:${crypto.randomUUID()}`
    setDraftLinks((current) => [...current, { id, url: normalized.url, name: imageNameFromUrl(normalized.url) }])
    setBannerId((current) => current || id)
    setLinkInput('')
  }

  const removeDraftLink = (id: string) => {
    setDraftLinks((current) => current.filter((link) => link.id !== id))
    if (bannerId === id) setBannerId('')
  }

  const addVideoLink = async () => {
    if (!videoInput.trim()) return
    setUploadError('')
    const ref = parseYouTube(videoInput)
    if (!ref) return setUploadError('Ese enlace no es de YouTube. Pega la dirección del vídeo (youtube.com/watch?v=… o youtu.be/…).')
    const url = youTubeWatchUrl(ref)
    if (draftVideos.some((video) => video.url === url) || activeVideos.some((video) => video.file_path === url)) {
      return setUploadError('Ese vídeo ya está añadido.')
    }
    const id = `new-video:${crypto.randomUUID()}`
    setDraftVideos((current) => [...current, { id, ref, url, title: 'Vídeo de YouTube' }])
    setVideoInput('')
    const title = await fetchYouTubeTitle(ref.id)
    if (title) setDraftVideos((current) => current.map((video) => video.id === id ? { ...video, title } : video))
  }

  const saveResource = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) return setUploadError('Añade un título.')
    const existingAttachments = (editing?.resource_attachments ?? []).filter((attachment) => !removedAttachmentIds.includes(attachment.id))
    const existingImages = existingAttachments.filter((attachment) => ALLOWED_IMAGE_TYPES.includes(attachment.file_type))
    const imageCount = existingImages.length + draftImages.length + draftLinks.length
    if (imageCount && !bannerId) return setUploadError('Selecciona una imagen de portada antes de guardar.')
    if (imageCount > MAX_IMAGES) return setUploadError(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes por recurso.`)

    setSaving(true)
    setUploadError('')
    const uploadedKeys: string[] = []
    let createdResourceId: string | null = null
    let workingResourceId: string | null = null
    const insertedLinkPaths: string[] = []
    const activeMultipartUploads: MultipartUpload[] = []
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.')

      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        resource_type: form.resource_type,
        status: form.status,
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
      workingResourceId = resourceId

      const uploadedAttachments: Omit<ResourceAttachment, 'id' | 'created_at'>[] = []
      const uploadedFilePaths = new Map<string, string>()
      const newAttachments = [
        ...draftImages.map((image) => ({ ...image, purpose: 'resource-image' as const })),
        ...draftFiles.map((file) => ({ ...file, purpose: 'resource-file' as const })),
      ]
      for (const [index, attachment] of newAttachments.entries()) {
        const contentType = attachment.file.type || 'application/octet-stream'
        let key: string
        if (attachment.purpose === 'resource-file') {
          const multipart = await postUploadAction<MultipartUpload>({
            filename: attachment.file.name,
            contentType,
            fileSize: attachment.file.size,
            purpose: attachment.purpose,
          })
          activeMultipartUploads.push(multipart)
          uploadedKeys.push(multipart.key)
          key = multipart.key
          setUploadProgress(`Subiendo ${attachment.file.name}: 0%`)
          await uploadResourceFile(attachment.file, multipart, (percentage) => {
            setUploadProgress(`Subiendo ${attachment.file.name}: ${percentage}%`)
          })
          activeMultipartUploads.splice(activeMultipartUploads.indexOf(multipart), 1)
        } else {
          const signed = await postUploadAction<{ uploadUrl: string; key: string }>({
            filename: attachment.file.name,
            contentType,
            fileSize: attachment.file.size,
            purpose: attachment.purpose,
          })
          uploadedKeys.push(signed.key)
          key = signed.key
          const uploadResponse = await fetch(signed.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: attachment.file,
          })
          if (!uploadResponse.ok) throw new Error(`No se pudo subir ${attachment.file.name} a R2. Inténtalo de nuevo.`)
        }

        uploadedFilePaths.set(attachment.id, key)
        uploadedAttachments.push({
          resource_id: resourceId,
          user_id: user.id,
          file_name: attachment.file.name,
          file_path: key,
          file_type: contentType,
          file_size: attachment.file.size,
          position: existingAttachments.length + index,
          is_banner: false,
        })
      }

      // Imágenes por enlace y vídeos: solo se guarda la dirección, no hay nada que subir.
      const linkRows = draftLinks.map((link, index) => ({
        resource_id: resourceId!,
        user_id: user.id,
        file_name: link.name,
        file_path: link.url,
        file_type: imageTypeFromUrl(link.url),
        file_size: 0,
        position: existingAttachments.length + newAttachments.length + index,
        is_banner: false,
      }))
      const videoRows = draftVideos.map((video, index) => ({
        resource_id: resourceId!,
        user_id: user.id,
        file_name: video.title,
        file_path: video.url,
        file_type: VIDEO_TYPE,
        file_size: 0,
        position: existingAttachments.length + newAttachments.length + linkRows.length + index,
        is_banner: false,
      }))
      for (const link of draftLinks) uploadedFilePaths.set(link.id, link.url)
      insertedLinkPaths.push(...linkRows.map((row) => row.file_path), ...videoRows.map((row) => row.file_path))
      uploadedAttachments.push(...linkRows, ...videoRows)

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
        for (const [position, attachment] of existingAttachments.entries()) {
          const { error } = await supabase.from('resource_attachments')
            .update({ position, is_banner: false })
            .eq('id', attachment.id).eq('resource_id', resourceId).eq('user_id', user.id)
          if (error) throw error
        }

        if (removedAttachmentIds.length) {
          const removed = (editing.resource_attachments ?? []).filter((attachment) => removedAttachmentIds.includes(attachment.id))
          const { error } = await supabase.from('resource_attachments').delete()
            .in('id', removedAttachmentIds).eq('resource_id', resourceId).eq('user_id', user.id)
          if (error) throw error
          for (const attachment of removed) {
            if (!await deleteStoredFile(attachment.file_path)) toast.error(`No se pudo limpiar el archivo ${attachment.file_name}.`)
          }
        }
      }

      const selectedBanner = bannerId.startsWith('new:')
        ? (draftImages.find((image) => image.id === bannerId) ?? draftLinks.find((link) => link.id === bannerId))
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
      setUploadProgress('')
      toast.error(message)
      let canCleanUploadedFiles = true
      for (const multipart of activeMultipartUploads) {
        try {
          await postUploadAction({ action: 'abort', key: multipart.key, uploadId: multipart.uploadId })
        } catch {
          toast.error(`No se pudo cancelar la carga multipart de ${multipart.key}.`)
        }
      }
      if (insertedLinkPaths.length && workingResourceId && !createdResourceId) {
        const { error: rollbackError } = await supabase.from('resource_attachments').delete()
          .in('file_path', insertedLinkPaths).eq('resource_id', workingResourceId)
        if (rollbackError) toast.error('No se pudieron revertir los enlaces añadidos.')
      }
      if (uploadedKeys.length) {
        const { error: rollbackError } = await supabase.from('resource_attachments').delete().in('file_path', uploadedKeys)
        if (rollbackError) {
          canCleanUploadedFiles = false
          toast.error('No se pudieron revertir los datos de los archivos. Se conservarán para evitar enlaces rotos.')
        }
      }
      if (createdResourceId) {
        const { error: rollbackError } = await supabase.from('resources').delete().eq('id', createdResourceId)
        if (rollbackError) {
          canCleanUploadedFiles = false
          toast.error('No se pudo revertir el recurso nuevo; los archivos se conservarán para evitar enlaces rotos.')
        }
      }
      if (canCleanUploadedFiles) {
        for (const key of uploadedKeys) {
          if (!await deleteStoredFile(key)) toast.error('No se pudo limpiar un archivo subido. Contacta con soporte.')
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
    if (cleanupResults.some((success) => !success)) toast.error('No se pudieron limpiar todos los archivos del recurso.')
  }

  const openLightbox = (images: ResourceAttachment[], startId: string) => {
    const list = images.map((image) => ({ id: image.id, name: image.file_name, src: imageUrl(image.file_path) }))
    setLightbox({ images: list, index: Math.max(0, list.findIndex((image) => image.id === startId)) })
  }

  const activeAttachments = (editing?.resource_attachments ?? []).filter((attachment) => !removedAttachmentIds.includes(attachment.id))
  const activeImages = activeAttachments.filter((attachment) => ALLOWED_IMAGE_TYPES.includes(attachment.file_type))
  const activeVideos = activeAttachments.filter((attachment) => attachment.file_type === VIDEO_TYPE)
  const activeFiles = activeAttachments.filter((attachment) => !ALLOWED_IMAGE_TYPES.includes(attachment.file_type) && attachment.file_type !== VIDEO_TYPE)

  return <div className="min-h-screen bg-background"><Header profile={profile} role={role} /><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-primary"><Bookmark className="size-4" /><span className="text-sm font-medium uppercase tracking-wider">Biblioteca privada</span></div><h1 className="text-3xl font-bold tracking-tight">Recursos FiveM</h1><p className="mt-2 text-muted-foreground">{canEdit ? 'Guarda referencias, enlaces y descargas de tus recursos autorizados.' : 'Consulta los recursos y lee su descripción. Las descargas y referencias son solo para administradores.'}</p></div>
      {canEdit && (
      <Dialog open={open} onOpenChange={onDialogOpenChange}>
        <DialogTrigger asChild><Button onClick={openNewResource}><Plus data-icon="inline-start" />Añadir recurso</Button></DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar recurso' : 'Nuevo recurso'}</DialogTitle></DialogHeader>
          <form onSubmit={saveResource}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2"><Label htmlFor="resource-title">Título</Label><Input id="resource-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Inventario avanzado" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2"><Label>Tipo</Label><Select value={form.resource_type} onValueChange={(value) => setForm({ ...form, resource_type: value as ResourceType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                <div className="flex flex-col gap-2"><Label>Estado</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ResourceStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="flex flex-col gap-2"><Label>Etiquetas</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="qbcore, ui" /></div>
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
                <div className="flex gap-2">
                  <Input value={linkInput} onChange={(e) => setLinkInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addImageLink() } }} placeholder="…o pega un enlace de imagen (imgur .png, etc.)" aria-label="Enlace de imagen" />
                  <Button type="button" variant="outline" onClick={() => void addImageLink()} disabled={checkingLink || !linkInput.trim()}>{checkingLink ? <Loader2 className="size-4 animate-spin" /> : <Link2 data-icon="inline-start" />}Añadir</Button>
                </div>
                <p className="text-xs text-muted-foreground">Las imágenes por enlace no se suben: solo se guarda la dirección.</p>
                {(activeImages.length + draftImages.length + draftLinks.length > 0) && <p className="text-xs text-muted-foreground">Selecciona una portada. El resto aparecerá como miniaturas enlazadas.</p>}
                <div className="grid grid-cols-3 gap-2">
                  {activeImages.map((attachment) => (
                    <div key={attachment.id} className={`relative overflow-hidden rounded-md border ${bannerId === attachment.id ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                      <button type="button" className="block w-full text-left" onClick={() => setBannerId(attachment.id)} aria-label={`Usar ${attachment.file_name} como portada`} aria-pressed={bannerId === attachment.id}>
                        <img src={imageUrl(attachment.file_path)} alt={attachment.file_name} referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
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
                  {draftLinks.map((link) => (
                    <div key={link.id} className={`relative overflow-hidden rounded-md border ${bannerId === link.id ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                      <button type="button" className="block w-full text-left" onClick={() => setBannerId(link.id)} aria-label={`Usar ${link.name} como portada`} aria-pressed={bannerId === link.id}>
                        <img src={link.url} alt={link.name} referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
                        <span className="flex items-center gap-1 truncate px-2 py-1 text-[11px]"><Link2 className="size-3 shrink-0" />{bannerId === link.id ? 'Portada' : 'Elegir portada'}</span>
                      </button>
                      <Button type="button" variant="secondary" size="icon-sm" className="absolute right-1 top-1 size-7" aria-label={`Quitar ${link.name}`} onClick={() => removeDraftLink(link.id)}><X className="size-3.5" /></Button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-2" aria-labelledby="resource-videos-title">
                <div><Label id="resource-videos-title">Vídeos</Label><p className="mt-1 text-xs text-muted-foreground">Enlaces de YouTube. Se reproducen dentro de la web sin salir de ella.</p></div>
                <div className="flex gap-2">
                  <Input value={videoInput} onChange={(e) => setVideoInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addVideoLink() } }} placeholder="Pega un enlace de YouTube" aria-label="Enlace de YouTube" />
                  <Button type="button" variant="outline" onClick={() => void addVideoLink()} disabled={!videoInput.trim()}><Video data-icon="inline-start" />Añadir</Button>
                </div>
                {(activeVideos.length > 0 || draftVideos.length > 0) && <ul className="flex flex-col gap-2">{draftVideos.map((video) => (
                  <li key={video.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><Video className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{video.title}</span></span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${video.title}`} onClick={() => setDraftVideos((current) => current.filter((item) => item.id !== video.id))}><X className="size-3.5" /></Button>
                  </li>
                ))}{activeVideos.map((attachment) => (
                  <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
                    <a href={attachment.file_path} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-primary hover:underline"><ExternalLink className="size-4 shrink-0" /><span className="truncate">{attachment.file_name}</span></a>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${attachment.file_name}`} onClick={() => removeExistingFile(attachment)}><X className="size-3.5" /></Button>
                  </li>
                ))}</ul>}
              </section>
              <section className="flex flex-col gap-2" aria-labelledby="resource-files-title">
                <div><Label id="resource-files-title">Archivos adjuntos</Label><p className="mt-1 text-xs text-muted-foreground">Cualquier tipo de archivo, hasta 700 MB cada uno. Se guardan en Cloudflare R2.</p></div>
                <label htmlFor="resource-files" className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
                  <Paperclip className="size-4" />Selecciona archivos para subir a R2
                  <input id="resource-files" type="file" multiple className="sr-only" onChange={(event) => { addResourceFiles(event.currentTarget.files); event.currentTarget.value = '' }} />
                </label>
                {(activeFiles.length > 0 || draftFiles.length > 0) && <ul className="flex flex-col gap-2">
                  {activeFiles.map((attachment) => (
                    <li key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
                      <a href={imageUrl(attachment.file_path)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-primary hover:underline">
                        <FileText className="size-4 shrink-0" /><span className="truncate">{attachment.file_name}</span>
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground">{(attachment.file_size / (1024 * 1024)).toFixed(1)} MB</span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${attachment.file_name}`} onClick={() => removeExistingFile(attachment)}><X className="size-3.5" /></Button>
                    </li>
                  ))}
                  {draftFiles.map(({ file, id }) => (
                    <li key={id} className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="truncate">{file.name}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${file.name}`} onClick={() => removeDraftFile(id)}><X className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>}
              </section>
              {uploadProgress && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{uploadProgress}</p>}
              {uploadError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{uploadError}</p>}
            </div>
            <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => onDialogOpenChange(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />}{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar recurso'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      )}
    </div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar recursos, etiquetas..." /></div><Select value={type} onValueChange={(value) => setType(value as typeof type)}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los tipos</SelectItem>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => {
      const attachments = (item.resource_attachments ?? []).slice().sort((a, b) => a.position - b.position)
      const imageAttachments = attachments.filter((attachment) => ALLOWED_IMAGE_TYPES.includes(attachment.file_type))
      const videos = attachments.filter((attachment) => attachment.file_type === VIDEO_TYPE)
      const files = attachments.filter((attachment) => !ALLOWED_IMAGE_TYPES.includes(attachment.file_type) && attachment.file_type !== VIDEO_TYPE)
      const banner = imageAttachments.find((attachment) => attachment.is_banner)
      const galleryImages = [...(banner ? [banner] : []), ...imageAttachments.filter((attachment) => attachment.id !== banner?.id)]
      const thumbnails = imageAttachments.filter((attachment) => attachment.id !== banner?.id)
      return <Card key={item.id} className="group overflow-hidden border-border/60 bg-card/70">
        {banner && <button type="button" className="block w-full overflow-hidden" onClick={() => openLightbox(galleryImages, banner.id)} aria-label={`Ver portada de ${item.title} en grande`}><img src={imageUrl(banner.file_path)} alt={`Portada: ${item.title}`} referrerPolicy="no-referrer" className="aspect-[16/8] w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-[1.02]" /></button>}
        <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap gap-1.5"><Badge className={typeColors[item.resource_type]}>{typeLabels[item.resource_type]}</Badge><Badge className={statusColors[item.status ?? 'pending']}>{statusLabels[item.status ?? 'pending']}</Badge></div><CardTitle className="mt-3 text-lg"><button type="button" className="text-left hover:underline" onClick={() => setDetail(item)}>{item.title}</button></CardTitle></div><div className="flex shrink-0 items-center"><Button variant="ghost" size="icon" onClick={() => setDetail(item)} aria-label={`Ver ${item.title} en grande`}><Maximize2 className="size-4 text-muted-foreground" /></Button>{canEdit && item.user_id === profile?.id && <><Button variant="ghost" size="icon" onClick={() => openEditResource(item)} aria-label={`Editar ${item.title}`}><Pencil className="size-4 text-muted-foreground" /></Button><Button variant="ghost" size="icon" onClick={() => void removeResource(item)} aria-label={`Eliminar ${item.title}`}><Trash2 className="size-4 text-muted-foreground" /></Button></>}</div></div><CardDescription className="line-clamp-2">{item.description || 'Sin descripción'}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {videos.length > 0 && <div className="flex flex-col gap-3">{videos.map((video) => { const yt = parseYouTube(video.file_path); return yt ? <div key={video.id} className="flex flex-col gap-1.5"><YouTubeEmbed key={yt.id} id={yt.id} start={yt.start} title={video.file_name} /><p className="truncate text-xs text-muted-foreground" title={video.file_name}>{video.file_name}</p></div> : canOpenReferences ? <a key={video.id} href={video.file_path} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-sm text-primary hover:underline"><ExternalLink className="size-4 shrink-0" /><span className="truncate">{video.file_name}</span></a> : <span key={video.id} className="flex items-center gap-2 truncate text-sm text-muted-foreground"><Video className="size-4 shrink-0" /><span className="truncate">{video.file_name}</span></span> })}</div>}
          {thumbnails.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Más imágenes del recurso">{thumbnails.map((attachment) => <button type="button" key={attachment.id} onClick={() => openLightbox(galleryImages, attachment.id)} title={`Ver ${attachment.file_name}`} className="shrink-0 overflow-hidden rounded-md border border-border/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><img src={imageUrl(attachment.file_path)} alt={attachment.file_name} referrerPolicy="no-referrer" className="size-14 cursor-zoom-in object-cover transition-opacity hover:opacity-80" /></button>)}</div>}
          {files.length > 0 && <div className="flex flex-col gap-2">{files.map((attachment) => canDownload && attachment.file_path ? <a key={attachment.id} href={imageUrl(attachment.file_path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 truncate text-sm text-primary hover:underline"><FileText className="size-4 shrink-0" /><span className="truncate">{attachment.file_name}</span><Download className="ml-auto size-3.5 shrink-0" /></a> : <div key={attachment.id} className="flex items-center gap-2 truncate text-sm text-muted-foreground"><FileText className="size-4 shrink-0" /><span className="truncate">{attachment.file_name}</span><span className="ml-auto shrink-0 text-xs">{(attachment.file_size / (1024 * 1024)).toFixed(1)} MB</span></div>)}</div>}
          <div className="flex flex-wrap gap-1.5">{item.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>)}</div>
          {canOpenReferences && <div className="flex items-center gap-2 border-t border-border/60 pt-3">{item.url && <Button asChild variant="outline" size="sm"><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Referencia</a></Button>}{item.download_url && <Button asChild size="sm"><a href={item.download_url} target="_blank" rel="noreferrer"><Download data-icon="inline-start" />Descarga</a></Button>}{!item.url && !item.download_url && <span className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="size-3.5" />Sin enlaces</span>}</div>}
        </CardContent>
      </Card>
    })}</div> : <div className="rounded-xl border border-dashed border-border p-12 text-center"><Bookmark className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="font-semibold">{resources.length ? 'No hay resultados' : canEdit ? 'Tu biblioteca está vacía' : 'Todavía no hay recursos'}</h2><p className="mt-1 text-sm text-muted-foreground">{resources.length ? 'Prueba con otra búsqueda o tipo de recurso.' : 'Añade enlaces, notas y referencias de recursos con licencia o autorización.'}</p>{!resources.length && <Button className="mt-4" onClick={openNewResource}><Plus data-icon="inline-start" />Añadir recurso</Button>}</div>}
  </main>
    <ResourceDetailDialog canDownload={canDownload} canEdit={canEdit && detail?.user_id === profile?.id} resource={detail ? (resources.find((item) => item.id === detail.id) ?? detail) : null} open={!!detail} onOpenChange={(next) => { if (!next) setDetail(null) }} onEdit={(resource) => { setDetail(null); openEditResource(resource) }} />
    {lightbox && <ImageLightbox images={lightbox.images} index={lightbox.index} onIndexChange={(index) => setLightbox((current) => current && { ...current, index })} onClose={() => setLightbox(null)} allowDownload={canDownload} />}
  </div>
}
