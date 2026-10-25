'use client'

import { useEffect } from 'react'
import { proxiedImageUrl } from '@/lib/image-proxy'

/**
 * Plan B para imágenes externas (imgur…): si el navegador no consigue cargar una,
 * se vuelve a pedir una sola vez a través de /api/image-proxy. Así se ven aunque
 * la red, el país o una extensión de esa persona bloqueen el dominio original.
 * Funciona para todas las <img> de la app, incluidas las de diálogos y visores.
 */
export function ImageFallback() {
  useEffect(() => {
    const onError = (event: Event) => {
      const img = event.target
      if (!(img instanceof HTMLImageElement) || img.dataset.proxied) return

      const src = img.currentSrc || img.src
      let url: URL
      try {
        url = new URL(src)
      } catch {
        return
      }
      if (url.origin === window.location.origin || (url.protocol !== 'https:' && url.protocol !== 'http:')) return

      img.dataset.proxied = '1'
      img.src = proxiedImageUrl(src)
    }

    // El evento "error" de <img> no sube por el DOM: hay que escucharlo en la fase de captura.
    document.addEventListener('error', onError, true)
    return () => document.removeEventListener('error', onError, true)
  }, [])

  return null
}
