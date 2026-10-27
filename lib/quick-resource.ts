import { extractLinks, suggestResourceType } from '@/lib/task-to-resource'
import { imageNameFromUrl, normalizeImageUrl } from '@/lib/image-links'
import { parseYouTube, youTubeWatchUrl, type YouTubeRef } from '@/lib/youtube'
import type { ResourceType } from '@/lib/types'

/** Lo que se deduce de un texto pegado para guardar un recurso sin rellenar el formulario entero. */
export interface QuickDraft {
  title: string
  /** Enlace de referencia (página del recurso, repositorio…). */
  url: string
  downloadUrl: string
  description: string
  resourceType: ResourceType
  images: { url: string; name: string }[]
  videos: { url: string; ref: YouTubeRef }[]
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i
const DOWNLOAD_HINT = /(download|descarg|drive\.google\.com|mega\.nz|mediafire|dropbox\.com|github\.com\/[^/]+\/[^/]+\/releases)/i
const LINK_RE = /https?:\/\/[^\s<>"']+/gi

function isImageLink(link: string): boolean {
  try {
    const url = new URL(link)
    const host = url.hostname.replace(/^(www|m)\./, '')
    if (host === 'i.imgur.com') return true
    // imgur.com/abc1234 es una imagen suelta; /a/… y /gallery/… son álbumes y se tratan como enlace normal.
    if (host === 'imgur.com') return /^\/[A-Za-z0-9]{5,8}$/.test(url.pathname)
    return IMAGE_EXT.test(url.pathname)
  } catch {
    return false
  }
}

/** Título razonable a partir de un enlace (en GitHub, el nombre del repositorio). */
export function titleFromUrl(link: string): string {
  try {
    const url = new URL(link)
    const host = url.hostname.replace(/^(www|m)\./, '')
    const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
    if (host === 'github.com' && parts.length >= 2) return parts[1]
    const last = parts[parts.length - 1]
    if (last) {
      const title = last.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 120)
      if (title) return title
    }
    return host
  } catch {
    return ''
  }
}

/**
 * Analiza un texto pegado (un enlace, varios, o un texto con enlaces) y propone el recurso:
 *  · enlaces de imagen (imgur, .png…) → imágenes (la primera será la portada)
 *  · enlaces de YouTube → vídeos
 *  · enlaces de descarga (Drive, Mega, releases de GitHub…) → enlace de descarga
 *  · el primer enlace restante → referencia
 *  · la primera línea de texto → título; el resto de texto (y enlaces sobrantes) → descripción
 */
export function parseQuickPaste(text: string): QuickDraft {
  let url = ''
  let downloadUrl = ''
  const images: QuickDraft['images'] = []
  const videos: QuickDraft['videos'] = []
  const extraLinks: string[] = []

  for (const link of extractLinks(text)) {
    const youtube = parseYouTube(link)
    if (youtube) {
      if (!videos.some((video) => video.ref.id === youtube.id)) videos.push({ url: youTubeWatchUrl(youtube), ref: youtube })
      continue
    }
    if (isImageLink(link)) {
      const normalized = normalizeImageUrl(link)
      if ('url' in normalized && !images.some((image) => image.url === normalized.url)) {
        images.push({ url: normalized.url, name: imageNameFromUrl(normalized.url) })
      }
      continue
    }
    if (!downloadUrl && DOWNLOAD_HINT.test(link)) {
      downloadUrl = link
      continue
    }
    if (!url) {
      url = link
      continue
    }
    extraLinks.push(link)
  }

  const lines = text
    .replace(LINK_RE, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const title = (lines[0] ?? titleFromUrl(url || downloadUrl || videos[0]?.url || '')).slice(0, 120)
  const description = [...lines.slice(1), ...extraLinks].join('\n').slice(0, 2000)

  let resourceType = suggestResourceType([title, description, url, downloadUrl].join(' '))
  if (resourceType === 'other' && /github\.com/i.test(url + downloadUrl)) resourceType = 'script'

  return { title, url, downloadUrl, description, resourceType, images, videos }
}
