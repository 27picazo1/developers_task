/**
 * Subida de imágenes a Imgur directamente desde el navegador.
 *
 * Se hace desde el navegador (y no desde una función del servidor) porque Vercel no admite
 * peticiones de más de 4,5 MB a una función y una captura de pantalla puede pesar más.
 * El Client-ID lo entrega /api/upload-imgur solo a quien puede editar recursos.
 */

export type ImgurUpload = { url: string; deleteHash?: string }

let cachedClientId: string | null = null

async function getClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId
  const response = await fetch('/api/upload-imgur', { credentials: 'same-origin' })
  const data = (await response.json().catch(() => ({}))) as { clientId?: string; error?: string }
  if (!response.ok || !data.clientId) throw new Error(data.error || 'Imgur no está configurado.')
  cachedClientId = data.clientId
  return cachedClientId
}

/** Imgur devuelve el error como texto o como { message }. */
function imgurErrorMessage(data: unknown, status: number): string {
  const error = (data as { data?: { error?: unknown } } | null)?.data?.error
  if (typeof error === 'string' && error) return error
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  if (status === 429) return 'Imgur ha limitado las subidas, prueba en unos minutos.'
  return `Imgur respondió ${status}`
}

/** Sube una imagen a Imgur y devuelve su enlace directo (https://i.imgur.com/….png). */
export async function uploadImageToImgur(file: File): Promise<ImgurUpload> {
  const clientId = await getClientId()
  const body = new FormData()
  body.append('image', file)
  body.append('type', 'file')
  body.append('name', file.name)

  const response = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: { Authorization: `Client-ID ${clientId}` },
    body,
  })
  const data = (await response.json().catch(() => null)) as { success?: boolean; data?: { link?: string; deletehash?: string } } | null
  if (!response.ok || !data?.success || !data.data?.link) throw new Error(imgurErrorMessage(data, response.status))
  return { url: data.data.link.replace(/^http:/, 'https:'), deleteHash: data.data.deletehash }
}
