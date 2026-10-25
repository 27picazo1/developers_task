/**
 * Proxy de imágenes externas (imgur…).
 *
 * Algunas redes, países o extensiones del navegador bloquean imgur. Cuando una
 * imagen no carga, el navegador la vuelve a pedir a través de nuestro servidor
 * (/api/image-proxy), que sí puede llegar a imgur.
 */

/** Dominios que el servidor puede descargar (incluye subdominios: i.imgur.com). */
export const IMAGE_PROXY_BASE_HOSTS = ['imgur.com']

export function isAllowedProxyHost(hostname: string, extraHosts: string[] = []): boolean {
  const host = hostname.toLowerCase()
  return [...IMAGE_PROXY_BASE_HOSTS, ...extraHosts].some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

export const proxiedImageUrl = (url: string) => `/api/image-proxy?url=${encodeURIComponent(url)}`
