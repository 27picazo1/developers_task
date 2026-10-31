/**
 * Subida de imágenes a un alojamiento externo directamente desde el navegador, con varios
 * servicios de respaldo: si uno falla (límite de uso, caída, clave mala…) se prueba el siguiente.
 *
 * Servicios (se activan con variables de entorno en Vercel; el orden es este):
 *  · Imgur           → IMGUR_CLIENT_ID    (solo si ya tenías un Client ID: Imgur ya no admite registros nuevos)
 *  · ImgBB           → IMGBB_API_KEY      (https://api.imgbb.com)
 *  · freeimage.host  → FREEIMAGE_API_KEY  (https://freeimage.host/api)
 *
 * Se sube desde el navegador (y no desde una función del servidor) porque Vercel no admite peticiones
 * de más de 4,5 MB a una función y una captura de pantalla puede pesar más. Las claves las entrega
 * /api/upload-imgur solo a quien puede editar recursos.
 */

export type ImageUpload = { url: string; provider: ProviderId }

export type ProviderId = 'imgur' | 'imgbb' | 'freeimage'
type Provider = { provider: ProviderId; clientId?: string; apiKey?: string }

export const PROVIDER_NAMES: Record<ProviderId, string> = { imgur: 'Imgur', imgbb: 'ImgBB', freeimage: 'freeimage.host' }

/** Fallo de un servicio. `cooldown` = merece la pena dejarlo descansar un rato (límite, caída, sin conexión). */
class HostError extends Error {
  constructor(message: string, readonly cooldown: boolean) {
    super(message)
  }
}

const COOLDOWN_MS = 10 * 60 * 1000
const cooldownUntil = new Map<ProviderId, number>()
let cachedProviders: Provider[] | null = null

async function getProviders(): Promise<Provider[]> {
  if (cachedProviders) return cachedProviders
  const response = await fetch('/api/upload-imgur', { credentials: 'same-origin' })
  const data = (await response.json().catch(() => ({}))) as { providers?: Provider[]; provider?: ProviderId; clientId?: string; apiKey?: string; error?: string }
  if (response.ok) {
    const list = Array.isArray(data.providers) ? data.providers : data.provider ? [{ provider: data.provider, clientId: data.clientId, apiKey: data.apiKey }] : data.clientId ? [{ provider: 'imgur' as const, clientId: data.clientId }] : []
    const valid = list.filter((item) => item && item.provider in PROVIDER_NAMES && (item.clientId || item.apiKey))
    if (valid.length) return (cachedProviders = valid)
  }
  throw new Error(data.error || 'No hay un servicio de imágenes configurado.')
}

function errorText(value: unknown): string {
  if (typeof value === 'string' && value) return value
  if (value && typeof value === 'object' && 'message' in value && typeof (value as { message: unknown }).message === 'string') {
    return (value as { message: string }).message
  }
  return ''
}

const failure = (name: string, status: number, text: string) =>
  new HostError(text || (status === 429 ? `${name} ha limitado las subidas, prueba en unos minutos.` : `${name} respondió ${status}`), status === 429 || status >= 500)

async function send(name: string, request: () => Promise<Response>): Promise<{ response: Response; data: any }> {
  let response: Response
  try {
    response = await request()
  } catch (error) {
    throw new HostError(error instanceof Error ? error.message : 'sin conexión', true) // red bloqueada o servicio caído
  }
  const data = await response.json().catch(() => null)
  return { response, data }
}

async function uploadToImgur(file: File, clientId: string): Promise<string> {
  const body = new FormData()
  body.append('image', file)
  body.append('type', 'file')
  body.append('name', file.name)
  const { response, data } = await send('Imgur', () => fetch('https://api.imgur.com/3/image', { method: 'POST', headers: { Authorization: `Client-ID ${clientId}` }, body }))
  if (!response.ok || !data?.success || !data.data?.link) throw failure('Imgur', response.status, errorText(data?.data?.error))
  return data.data.link
}

async function uploadToImgbb(file: File, apiKey: string): Promise<string> {
  const body = new FormData()
  body.append('key', apiKey)
  body.append('image', file)
  const { response, data } = await send('ImgBB', () => fetch('https://api.imgbb.com/1/upload', { method: 'POST', body }))
  // data.url es el enlace directo a la imagen (display_url es la página con visor).
  if (!response.ok || !data?.success || !data.data?.url) throw failure('ImgBB', response.status, errorText(data?.error))
  return data.data.url
}

async function uploadToFreeimage(file: File, apiKey: string): Promise<string> {
  const body = new FormData()
  body.append('key', apiKey)
  body.append('action', 'upload')
  body.append('format', 'json')
  body.append('source', file)
  const { response, data } = await send('freeimage.host', () => fetch('https://freeimage.host/api/1/upload', { method: 'POST', body }))
  if (!response.ok || data?.status_code !== 200 || !data.image?.url) throw failure('freeimage.host', response.status, errorText(data?.error))
  return data.image.url
}

async function uploadWith(provider: Provider, file: File): Promise<string> {
  if (provider.provider === 'imgur') return uploadToImgur(file, provider.clientId ?? '')
  if (provider.provider === 'imgbb') return uploadToImgbb(file, provider.apiKey ?? '')
  return uploadToFreeimage(file, provider.apiKey ?? '')
}

/**
 * Sube una imagen y devuelve su enlace directo (https). Prueba los servicios configurados en orden;
 * a uno que acaba de fallar por límite o caída lo deja descansar 10 minutos y usa antes los demás.
 */
export async function uploadImage(file: File): Promise<ImageUpload> {
  const providers = await getProviders()
  const now = Date.now()
  const resting = (item: Provider) => (cooldownUntil.get(item.provider) ?? 0) > now
  const order = [...providers.filter((item) => !resting(item)), ...providers.filter(resting)]

  const errors: string[] = []
  for (const provider of order) {
    try {
      const url = await uploadWith(provider, file)
      cooldownUntil.delete(provider.provider)
      return { url: url.replace(/^http:/, 'https:'), provider: provider.provider }
    } catch (error) {
      if (error instanceof HostError && error.cooldown) cooldownUntil.set(provider.provider, Date.now() + COOLDOWN_MS)
      errors.push(`${PROVIDER_NAMES[provider.provider]}: ${error instanceof Error ? error.message : 'error desconocido'}`)
    }
  }
  throw new Error(errors.join(' · '))
}
