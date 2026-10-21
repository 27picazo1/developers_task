/** Utilidades para guardar imágenes solo por su enlace (imgur, etc.) en vez de subirlas. */

export type NormalizedImageUrl = { url: string } | { error: string }

/** Valida el enlace y arregla los casos típicos de imgur (página de la imagen → enlace directo). */
export function normalizeImageUrl(input: string): NormalizedImageUrl {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { error: 'Eso no parece un enlace. Pega la dirección completa, por ejemplo https://i.imgur.com/abc123.png' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { error: 'Solo se admiten enlaces http o https.' }
  }

  const host = url.hostname.replace(/^(www|m)\./, '')
  if (host === 'imgur.com') {
    if (/^\/(a|gallery)\//.test(url.pathname)) {
      return { error: 'Ese enlace de imgur es un álbum o una galería. Abre la imagen y copia su enlace directo (i.imgur.com/....png).' }
    }
    const m = url.pathname.match(/^\/([A-Za-z0-9]{5,8})$/)
    if (m) return { url: `https://i.imgur.com/${m[1]}.png` }
  }
  return { url: url.toString() }
}

export function imageTypeFromUrl(url: string): string {
  const ext = new URL(url).pathname.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  // Los recursos solo reconocen estos tipos; PNG es la etiqueta por defecto (el navegador muestra igual la imagen real).
  return 'image/png'
}

export function imageNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last).slice(0, 120) : 'imagen'
  } catch {
    return 'imagen'
  }
}

/** Comprueba en el navegador que el enlace es realmente una imagen que se puede mostrar. */
export function canLoadImage(url: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => finish(false), timeoutMs)
    function finish(ok: boolean) {
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve(ok)
    }
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.referrerPolicy = 'no-referrer'
    img.src = url
  })
}
