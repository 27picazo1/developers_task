import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { can } from '@/lib/roles'
import { parseQuickPaste, titleFromUrl } from '@/lib/quick-resource'
import { imageTypeFromUrl } from '@/lib/image-links'
import { VIDEO_TYPE } from '@/lib/youtube'

const MAX_TEXT = 6000

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status })

/**
 * Guardado de un clic desde la extensión del navegador.
 *
 * Recibe el mismo texto que el guardado rápido ("<enlace>\n<título>\n<texto seleccionado>"),
 * lo analiza con parseQuickPaste y crea el recurso con la sesión de la persona (cookies),
 * sin que la extensión tenga que iniciar sesión ni guardar ninguna clave.
 *
 * Seguridad:
 *  · Solo admin (igual que el formulario de Recursos); las políticas RLS siguen mandando.
 *  · Exige JSON + la cabecera X-Requested-With: una web cualquiera no puede lanzar esta petición
 *    desde el navegador (no hay CORS y la cabecera obliga a una comprobación previa).
 *  · Solo acepta peticiones sin Origin, del propio sitio o de una extensión del navegador.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const originOk = !origin || origin === request.nextUrl.origin || /^(chrome|moz)-extension:\/\//.test(origin)
  const contentType = request.headers.get('content-type') ?? ''
  if (!originOk || request.headers.get('x-requested-with') !== 'dev-tasks-extension' || !contentType.includes('application/json')) {
    return json({ error: 'forbidden' }, 403)
  }

  let createdId: string | null = null
  const supabase = await createClient()
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'not_authenticated' }, 401)

    const access = await getAccessStatus(supabase, user.id)
    if (!access.isMember || !can.editResources(access.role)) return json({ error: 'forbidden_role' }, 403)

    let text = ''
    try {
      const body = (await request.json()) as { text?: unknown }
      text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : ''
    } catch {
      return json({ error: 'bad_request' }, 400)
    }

    const draft = parseQuickPaste(text)
    if (!draft.title && !draft.url && !draft.downloadUrl && draft.images.length === 0 && draft.videos.length === 0) {
      return json({ error: 'empty' }, 400)
    }
    const title = draft.title || titleFromUrl(draft.url || draft.downloadUrl || draft.videos[0]?.url || '') || 'Recurso sin título'

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
        resource_type: draft.resourceType,
        status: 'pending',
        priority: 'medium',
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

    const rows = [
      ...draft.images.map((image, index) => ({
        resource_id: resource.id,
        user_id: user.id,
        file_name: image.name,
        file_path: image.url,
        file_type: imageTypeFromUrl(image.url),
        file_size: 0,
        position: index,
        is_banner: index === 0,
      })),
      ...draft.videos.map((video, index) => ({
        resource_id: resource.id,
        user_id: user.id,
        file_name: 'Vídeo de YouTube',
        file_path: video.url,
        file_type: VIDEO_TYPE,
        file_size: 0,
        position: draft.images.length + index,
        is_banner: false,
      })),
    ]
    if (rows.length) {
      const { error: attachmentsError } = await supabase.from('resource_attachments').insert(rows)
      if (attachmentsError) throw attachmentsError
    }

    return json({ ok: true, id: resource.id, title, resourceType: draft.resourceType, images: draft.images.length, videos: draft.videos.length })
  } catch (error) {
    // Igual que el formulario: si algo falla a medias, no se deja un recurso huérfano.
    if (createdId) await supabase.from('resources').delete().eq('id', createdId)
    console.error('[quick-resource] no se pudo guardar:', error)
    return json({ error: 'save_failed', message: (error as { message?: string } | null)?.message ?? 'Error desconocido' }, 500)
  }
}
