// Los vídeos se guardan en la tabla de adjuntos (attachments) con este tipo, así
// que no hace falta ninguna migración en Supabase.
export const VIDEO_TYPE = 'video/youtube'
const YT_ID = /^[A-Za-z0-9_-]{11}$/

export interface YouTubeRef {
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
export function parseYouTube(input: string): YouTubeRef | null {
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

export const youTubeWatchUrl = ({ id, start }: YouTubeRef) =>
  `https://www.youtube.com/watch?v=${id}${start > 0 ? `&t=${start}s` : ''}`

export async function fetchYouTubeTitle(id: string): Promise<string> {
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
