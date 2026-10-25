import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { isAllowedProxyHost } from '@/lib/image-proxy'

const MAX_BYTES = 15 * 1024 * 1024
const MAX_REDIRECTS = 3
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Dominios extra opcionales, separados por comas (p. ej. "i.ibb.co,cdn.discordapp.com").
const extraHosts = (process.env.IMAGE_PROXY_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean)

/** Solo https, sin credenciales ni puerto, y solo dominios de la lista (evita SSRF). */
function parseAllowedUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    return isAllowedProxyHost(url.hostname, extraHosts) ? url : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getAccessStatus(supabase, user.id)
    if (!access.isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let target = parseAllowedUrl(request.nextUrl.searchParams.get('url') ?? '')
    if (!target) return NextResponse.json({ error: 'URL no permitida' }, { status: 400 })

    // Las redirecciones se siguen a mano para comprobar el dominio en cada salto.
    let upstream: Response | null = null
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      upstream = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
      })
      if (upstream.status < 300 || upstream.status >= 400) break
      const location = upstream.headers.get('location')
      const next = location ? parseAllowedUrl(new URL(location, target).toString()) : null
      if (!next) return NextResponse.json({ error: 'Redirección no permitida' }, { status: 502 })
      target = next
    }

    if (!upstream || !upstream.ok || !upstream.body) {
      // Si ves esto abriendo /api/image-proxy?url=... en el navegador, upstreamStatus
      // dice qué ha respondido imgur al servidor (403/429 = bloquea a Vercel).
      const upstreamStatus = upstream?.status ?? null
      console.error('[image-proxy] respuesta de origen no válida', upstreamStatus, target.toString())
      return NextResponse.json({ error: `El origen respondió ${upstreamStatus ?? 'sin respuesta'}`, upstreamStatus }, { status: 502 })
    }

    const type = upstream.headers.get('content-type') ?? ''
    if (!type.startsWith('image/') || type.startsWith('image/svg')) {
      return NextResponse.json({ error: 'El enlace no es una imagen compatible', contentType: type }, { status: 415 })
    }

    const length = Number(upstream.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES) return NextResponse.json({ error: 'Imagen demasiado grande' }, { status: 413 })

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': type,
        ...(length ? { 'Content-Length': String(length) } : {}),
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('[image-proxy] fallo al conectar con el origen:', detail)
    return NextResponse.json({ error: 'No se pudo conectar con el origen de la imagen', detail }, { status: 502 })
  }
}
