/**
 * Varios enlaces de descarga en un mismo recurso.
 *
 * Se guardan en la columna `download_url` de siempre, uno por línea. Así no hace falta tocar la
 * base de datos y el rango moderador sigue sin verlos (list_resources ya oculta esa columna).
 * Un recurso con un solo enlace (todos los anteriores) funciona igual que antes.
 */

/** Enlaces válidos (http/https) de un texto, sin repetir y en el orden en que aparecen. */
export function parseDownloadLinks(value: string | null | undefined): string[] {
  const links = (value ?? '').split(/\s+/).filter((part) => /^https?:\/\/\S+$/i.test(part))
  return [...new Set(links)]
}

/** Lo que se guarda en la base de datos: los enlaces válidos separados por saltos de línea, o null si no hay. */
export function joinDownloadLinks(value: string | null | undefined): string | null {
  const links = parseDownloadLinks(value)
  return links.length ? links.join('\n') : null
}

/** Nombre corto para mostrar de dónde es un enlace (mega.nz, drive.google.com…). */
export function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
