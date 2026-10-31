import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { can } from '@/lib/roles'
import { inferResourceType, mergeMedia, parseQuickPaste, titleFromUrl, type QuickDraft } from '@/lib/quick-resource'
import { imageNameFromUrl, imageTypeFromUrl, normalizeImageUrl } from '@/lib/image-links'
import { joinDownloadLinks } from '@/lib/download-links'
import { MAX_IMAGES, typeLabels } from '@/lib/resource-config'
import { VIDEO_TYPE, parseYouTube, youTubeWatchUrl } from '@/lib/youtube'
import type { ResourceType, TaskPriority } from '@/lib/types'

const MAX_TEXT = 6000

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })

/** Enlace http(s) válido, tal cual (completo, con ruta, parámetros y #). */
const isHttpUrl = (value: unknown): value is string => typeof value === 'string' && value.length <= 2000 && /^https?:\/\/\S+$/i.test(value.trim())

/**
 * Guardado desde la extensión del navegador.
 *
 *  · POST  → crea un recurso. Acepta el texto del guardado rápido ("<enlace>\n<título>\n<texto>") y/o campos
 *            sueltos: title, referenceUrl (siempre el enlace completo de la página), downloadUrls, description,
 *            images (enlaces ya subidos; la primera es la portada), priority y resourceType.
 *  · GET   → ?url=… dice si esa página ya está guardada y devuelve sus datos (para "Actualizar").
 *  · PATCH → actualiza un recurso propio (solo los campos que se mandan) y añade imágenes nuevas.
 *
 * Todo con la sesión de la persona (cookies): la extensión no inicia sesión ni guarda ninguna clave.
 *
 * Seguridad:
 *  · Solo admin (igual que el formulario de Recursos); las políticas RLS siguen mandando.
 *  · Exige la cabecera X-Requested-With (y JSON en POST/PATCH): una web cualquiera no puede lanzar estas
 *    peticiones desde el navegador (no hay CORS y la cabecera obliga a una comprobación previa).
 *  · Solo acepta peticiones sin Origin, del propio sitio o de una extensión del navegador.
 */
async function authenticate(request: NextRequest, needsJson: boolean) {
  const origin = request.headers.get('origin')
  const originOk = !origin || origin === request.nextUrl.origin || /^(chrome|moz)-extension:\/\//.test(origin)
  const contentType = request.headers.get('content-type') ?? ''
  if (!originOk || request.headers.get('x-requested-with') !== 'dev-tasks-extension' || (needsJson && !contentType.includes('application/json'))) {
    return { error: json({ error: 'forbidden' }, 403) }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: json({ error: 'not_authenticated' }, 401) }
  const access = await getAccessStatus(supabase, user.id)
  if (!access.isMember || !can.editResources(access.role)) return { error: json({ error: 'forbidden_role' }, 403) }
  return { supabase, user }
}

type Fields = {
  text: string
  title: string | null
  referenceUrl: string | null
  downloadUrls: string[] | null
  description: string | null
  images: string[]
  priority: TaskPriority | null
  resourceType: ResourceType | null
}

/** Lee y valida el cuerpo: todo lo que no sea válido se ignora (null = "no se ha mandado"). */
function readFields(body: Record<string, unknown>): Fields {
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null)
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
  return {
    text: typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '',
    title: title || null,
    referenceUrl: isHttpUrl(body.referenceUrl) ? body.referenceUrl.trim() : null,
    downloadUrls: strings(body.downloadUrls),
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : null,
    images: (strings(body.images) ?? []).slice(0, MAX_IMAGES),
    priority: body.priority === 'low' || body.priority === 'medium' || body.priority === 'high' ? body.priority : null,
    resourceType: typeof body.resourceType === 'string' && Object.keys(typeLabels).includes(body.resourceType) ? (body.resourceType as ResourceType) : null,
  }
}

/** Imágenes añadidas a mano: válidas, sin repetir. */
const manualImages = (urls: string[]) =>
  urls.flatMap((raw) => {
    const normalized = normalizeImageUrl(raw)
    return 'url' in normalized ? [{ url: normalized.url, name: imageNameFromUrl(normalized.url) }] : []
  })

function attachmentRows(resourceId: string, userId: string, images: QuickDraft['images'], videos: QuickDraft['videos'], firstPosition: number, firstIsBanner: boolean) {
  return [
    ...images.map((image, index) => ({
      resource_id: resourceId,
      user_id: userId,
      file_name: image.name,
      file_path: image.url,
      file_type: imageTypeFromUrl(image.url),
      file_size: 0,
      position: firstPosition + index,
      is_banner: firstIsBanner && index === 0,
    })),
    ...videos.map((video, index) => ({
      resource_id: resourceId,
      user_id: userId,
      file_name: 'Vídeo de YouTube',
      file_path: video.url,
      file_type: VIDEO_TYPE,
      file_size: 0,
      position: firstPosition + images.length + index,
      is_banner: false,
    })),
  ]
}

export async function POST(request: NextRequest) {
  let createdId: string | null = null
  try {
    const auth = await authenticate(request, true)
    if ('error' in auth) return auth.error
    const { supabase, user } = auth

    let fields: Fields
    try {
      fields = readFields((await request.json()) as Record<string, unknown>)
    } catch {
      return json({ error: 'bad_request' }, 400)
    }

    const draft = parseQuickPaste(fields.text)
    // Lo que llega en campos sueltos manda sobre lo que se deduce del texto.
    if (fields.title) draft.title = fields.title
    if (fields.referenceUrl) {
      draft.url = fields.referenceUrl // siempre el enlace completo de la página
      const youtube = parseYouTube(draft.url)
      if (youtube && !draft.videos.some((video) => video.ref.id === youtube.id)) draft.videos.unshift({ url: youTubeWatchUrl(youtube), ref: youtube })
    }
    if (fields.downloadUrls) draft.downloadUrl = joinDownloadLinks(fields.downloadUrls.join('\n')) ?? ''
    if (fields.description !== null) draft.description = fields.description
    // Imágenes añadidas a mano: van primero (la primera es la portada), sin repetir y con un máximo.
    draft.images = mergeMedia(manualImages(fields.images), draft.images, (image) => image.url, []).slice(0, MAX_IMAGES)

    if (!draft.title && !draft.url && !draft.downloadUrl && draft.images.length === 0 && draft.videos.length === 0) {
      return json({ error: 'empty' }, 400)
    }
    const title = draft.title || titleFromUrl(draft.url || draft.downloadUrl.split('\n')[0] || draft.videos[0]?.url || draft.images[0]?.url || '') || 'Recurso sin título'

    // Evita duplicados por un doble clic o por guardar dos veces la misma página.
    if (draft.url) {
      const { data: existing } = await supabase.from('resources').select('id, title').eq('url', draft.url).limit(1).maybeSingle()
      if (existing) return json({ duplicate: true, id: existing.id, title: existing.title })
    }

    const { data: resource, error } = await supabase
      .from('resources')
      .insert({
        title,
        description: draft.description || null,
        resource_type: fields.resourceType ?? inferResourceType(title, draft.description, draft.url, draft.downloadUrl),
        status: 'pending',
        priority: fields.priority ?? 'medium',
        url: draft.url || null,
        download_url: draft.downloadUrl || null,
        tags: [],
        notes: null,
        updated_at: new Date().toISOString(),
        user_id: user.id,
      })
      .select('id')
      .single()
    if (error) throw error
    createdId = resource.id as string

    const rows = attachmentRows(resource.id, user.id, draft.images, draft.videos, 0, true)
    if (rows.length) {
      const { error: attachmentsError } = await supabase.from('resource_attachments').insert(rows)
      if (attachmentsError) throw attachmentsError
    }

    return json({ ok: true, id: resource.id, title, resourceType: fields.resourceType ?? draft.resourceType, images: draft.images.length, videos: draft.videos.length })
  } catch (error) {
    // Igual que el formulario: si algo falla a medias, no se deja un recurso huérfano.
    if (createdId) await (await createClient()).from('resources').delete().eq('id', createdId)
    console.error('[quick-resource] no se pudo guardar:', error)
    return json({ error: 'save_failed', message: (error as { message?: string } | null)?.message ?? 'Error desconocido' }, 500)
  }
}

/** ¿Está ya guardada esta página? (misma dirección, con o sin "/" final). */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request, false)
    if ('error' in auth) return auth.error
    const { supabase, user } = auth

    const url = (request.nextUrl.searchParams.get('url') ?? '').trim()
    if (!isHttpUrl(url)) return json({ exists: false })
    const variants = [...new Set([url, url.endsWith('/') ? url.slice(0, -1) : `${url}/`])]

    const { data: resource } = await supabase
      .from('resources')
      .select('id, user_id, title, description, resource_type, priority, status, url, download_url, tags')
      .in('url', variants)
      .limit(1)
      .maybeSingle()
    if (!resource) return json({ exists: false })

    const { data: attachments } = await supabase
      .from('resource_attachments')
      .select('file_path, file_name, file_type, is_banner, position')
      .eq('resource_id', resource.id)
      .order('position', { ascending: true })
    const rows = attachments ?? []
    const images = rows.filter((row) => String(row.file_type).startsWith('image/'))
    // Las imágenes subidas a R2 no se pueden mostrar desde la extensión: solo se cuentan.
    const linkImages = images.filter((row) => /^https?:\/\//i.test(row.file_path))

    return json({
      exists: true,
      owned: resource.user_id === user.id,
      resource: {
        id: resource.id,
        title: resource.title,
        description: resource.description ?? '',
        resourceType: resource.resource_type,
        priority: resource.priority ?? 'medium',
        status: resource.status,
        url: resource.url ?? '',
        downloadUrls: (resource.download_url ?? '').split(/\s+/).filter(Boolean),
        tags: resource.tags ?? [],
      },
      images: linkImages.map((row) => ({ url: row.file_path, name: row.file_name, isBanner: !!row.is_banner })),
      hiddenImages: images.length - linkImages.length,
      videos: rows.filter((row) => row.file_type === VIDEO_TYPE).length,
      files: rows.length - images.length - rows.filter((row) => row.file_type === VIDEO_TYPE).length,
    })
  } catch (error) {
    console.error('[quick-resource] no se pudo consultar:', error)
    return json({ error: 'lookup_failed' }, 500)
  }
}

/** Actualiza un recurso propio: solo se tocan los campos que se mandan; las imágenes nuevas se añaden. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticate(request, true)
    if ('error' in auth) return auth.error
    const { supabase, user } = auth

    let body: Record<string, unknown>
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return json({ error: 'bad_request' }, 400)
    }
    if (typeof body.id !== 'string' || !body.id) return json({ error: 'bad_request' }, 400)
    const fields = readFields(body)

    const { data: existing } = await supabase.from('resources').select('id, user_id, title').eq('id', body.id).maybeSingle()
    if (!existing) return json({ error: 'not_found' }, 404)
    if (existing.user_id !== user.id) return json({ error: 'not_owner' }, 403)

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (fields.title) updates.title = fields.title
    if (fields.referenceUrl) updates.url = fields.referenceUrl
    if (fields.downloadUrls) updates.download_url = joinDownloadLinks(fields.downloadUrls.join('\n'))
    if (fields.description !== null) updates.description = fields.description || null
    if (fields.priority) updates.priority = fields.priority
    if (fields.resourceType) updates.resource_type = fields.resourceType
    const { error } = await supabase.from('resources').update(updates).eq('id', existing.id)
    if (error) throw error

    // Imágenes nuevas: se añaden detrás de las que ya hay; solo son portada si el recurso aún no tenía.
    const fresh = manualImages(fields.images)
    let added = 0
    if (fresh.length) {
      const { data: current } = await supabase.from('resource_attachments').select('file_path, file_type, is_banner, position').eq('resource_id', existing.id)
      const rows = current ?? []
      const known = new Set(rows.map((row) => row.file_path))
      const toAdd = fresh.filter((image) => !known.has(image.url)).slice(0, Math.max(0, MAX_IMAGES - rows.filter((row) => String(row.file_type).startsWith('image/')).length))
      if (toAdd.length) {
        const nextPosition = rows.reduce((max, row) => Math.max(max, Number(row.position) || 0), -1) + 1
        const hasBanner = rows.some((row) => row.is_banner && String(row.file_type).startsWith('image/'))
        const { error: attachmentsError } = await supabase.from('resource_attachments').insert(attachmentRows(existing.id, user.id, toAdd, [], nextPosition, !hasBanner))
        if (attachmentsError) throw attachmentsError
        added = toAdd.length
      }
    }

    return json({ ok: true, updated: true, id: existing.id, title: (updates.title as string | undefined) ?? existing.title, addedImages: added })
  } catch (error) {
    console.error('[quick-resource] no se pudo actualizar:', error)
    return json({ error: 'save_failed', message: (error as { message?: string } | null)?.message ?? 'Error desconocido' }, 500)
  }
}
