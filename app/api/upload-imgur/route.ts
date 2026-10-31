import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { can } from '@/lib/roles'

/**
 * Entrega la clave del servicio de imágenes a quien puede editar recursos (admin) para que suba las
 * imágenes directamente desde su navegador. Se hace así porque Vercel no admite peticiones de más de
 * 4,5 MB a una función y una captura de pantalla puede pesar más.
 *
 *  · IMGUR_CLIENT_ID   → Imgur (solo si ya lo tenías: Imgur ya no admite registros nuevos).
 *  · IMGBB_API_KEY     → ImgBB.
 *  · FREEIMAGE_API_KEY → freeimage.host.
 * Se devuelven todos los configurados, en ese orden: el navegador prueba el siguiente si uno falla
 * (por ejemplo Imgur limita las subidas). Las claves solo se entregan a admins con sesión iniciada.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getAccessStatus(supabase, user.id)
    if (!access.isMember || !can.editResources(access.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const providers: Array<{ provider: string; clientId?: string; apiKey?: string }> = []
    if (process.env.IMGUR_CLIENT_ID) providers.push({ provider: 'imgur', clientId: process.env.IMGUR_CLIENT_ID })
    if (process.env.IMGBB_API_KEY) providers.push({ provider: 'imgbb', apiKey: process.env.IMGBB_API_KEY })
    if (process.env.FREEIMAGE_API_KEY) providers.push({ provider: 'freeimage', apiKey: process.env.FREEIMAGE_API_KEY })
    if (!providers.length) {
      return NextResponse.json({ error: 'No hay servicio de imágenes configurado (falta IMGBB_API_KEY o FREEIMAGE_API_KEY en Vercel).' }, { status: 500 })
    }
    // Además de la lista se repite el primero en la raíz, para versiones antiguas de la extensión.
    return NextResponse.json({ ...providers[0], providers }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'No se pudo comprobar el servicio de imágenes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await getAccessStatus(supabase, user.id)
    if (!access.isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const clientId = process.env.IMGUR_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'Imgur no esta configurado' }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se encontro el archivo' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const imgurRes = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        Authorization: `Client-ID ${clientId}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64,
        type: 'base64',
        name: file.name,
      }),
    })

    const imgurData = await imgurRes.json()

    if (!imgurRes.ok || !imgurData.success) {
      throw new Error(imgurData.data?.error || 'Imgur rechazo la subida')
    }

    return NextResponse.json({
      fileUrl: imgurData.data.link,
      deleteHash: imgurData.data.deletehash,
      key: imgurData.data.link,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al subir a Imgur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
