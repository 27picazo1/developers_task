'use client'

import { useEffect } from 'react'
import { proxiedImageUrl } from '@/lib/image-proxy'

/** Si una imagen externa no ha cargado en este tiempo, se pide por el proxy. */
const SLOW_MS = 4000
/** Cuánto se recuerda que un dominio no llega desde este navegador. */
const REMEMBER_MS = 6 * 60 * 60 * 1000
const STORAGE_KEY = 'image-proxy-hosts'

function externalUrl(src: string): URL | null {
  try {
    const url = new URL(src, window.location.href)
    if (url.origin === window.location.origin) return null
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function readBlockedHosts(): Record<string, number> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>
    const now = Date.now()
    return Object.fromEntries(Object.entries(raw).filter(([, at]) => now - at < REMEMBER_MS))
  } catch {
    return {}
  }
}

function rememberBlockedHost(host: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readBlockedHosts(), [host]: Date.now() }))
  } catch {
    /* sin almacenamiento: se seguirá reintentando imagen a imagen */
  }
}

function inViewport(img: HTMLImageElement) {
  const rect = img.getBoundingClientRect()
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
}

/**
 * Plan B para imágenes externas (imgur…). Si una no carga en el navegador de esta
 * persona, se vuelve a pedir a través de /api/image-proxy. Cubre tres casos:
 *  1. La red rechaza la conexión → evento "error" → reintento inmediato.
 *  2. La red "cuelga" la conexión (no hay error, solo se queda cargando) → a los 4 s.
 *  3. Si el reintento funciona, se recuerda el dominio (6 h) y las siguientes
 *     imágenes van directas por el proxy, sin esperar.
 * Funciona para todas las <img> de la app, incluidas las de diálogos y visores.
 */
export function ImageFallback() {
  useEffect(() => {
    const timers = new WeakMap<HTMLImageElement, number>()
    let blockedHosts = readBlockedHosts()

    const clearTimer = (img: HTMLImageElement) => {
      const timer = timers.get(img)
      if (timer !== undefined) {
        window.clearTimeout(timer)
        timers.delete(img)
      }
    }

    const useProxy = (img: HTMLImageElement, url: URL, reason: string) => {
      clearTimer(img)
      console.info(`[imágenes] ${reason}: se reintenta por el proxy (${url.hostname})`)
      // Si por el proxy sí carga, es que el dominio no llega desde aquí: se recuerda.
      img.addEventListener(
        'load',
        () => {
          rememberBlockedHost(url.hostname)
          blockedHosts = readBlockedHosts()
        },
        { once: true },
      )
      img.src = proxiedImageUrl(url.toString())
    }

    const watch = (img: HTMLImageElement) => {
      const url = externalUrl(img.getAttribute('src') ?? '')
      if (!url || timers.has(img)) return
      if (blockedHosts[url.hostname]) {
        useProxy(img, url, 'dominio bloqueado en esta red')
        return
      }
      if (img.complete && img.naturalWidth > 0) return
      timers.set(
        img,
        window.setTimeout(() => {
          timers.delete(img)
          if (img.complete && img.naturalWidth > 0) return
          if (!inViewport(img)) return // imágenes perezosas fuera de pantalla: no se tocan
          const current = externalUrl(img.getAttribute('src') ?? '')
          if (current) useProxy(img, current, 'tarda demasiado en cargar')
        }, SLOW_MS),
      )
    }

    const onError = (event: Event) => {
      const img = event.target
      if (!(img instanceof HTMLImageElement)) return
      const url = externalUrl(img.currentSrc || img.src)
      if (url) useProxy(img, url, 'no se pudo cargar')
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          // Mismo <img> con otra imagen (p. ej. el visor al pasar de foto).
          if (mutation.target instanceof HTMLImageElement) {
            clearTimer(mutation.target)
            watch(mutation.target)
          }
          continue
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLImageElement) watch(node)
          else if (node instanceof Element) node.querySelectorAll('img').forEach(watch)
        })
      }
    })

    // El evento "error" de <img> no sube por el DOM: hay que escucharlo en la fase de captura.
    document.addEventListener('error', onError, true)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
    document.querySelectorAll('img').forEach(watch)

    return () => {
      document.removeEventListener('error', onError, true)
      observer.disconnect()
    }
  }, [])

  return null
}
