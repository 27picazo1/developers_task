import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { can } from '@/lib/roles'

/**
 * Entrega el Client-ID de Imgur a quien puede editar recursos (admin) para que suba las imágenes
 * directamente desde su navegador a Imgur. Se hace así porque Vercel no admite peticiones de más de
 * 4,5 MB a una función y una captura de pantalla puede pesar más. El Client-ID no es una clave secreta
 * (Imgur lo diseña para usarse en el navegador): solo identifica la aplicación.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const access = await getAccessStatus(supabase, user.id)
    if (!access.isMember || !can.editResources(access.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const clientId = process.env.IMGUR_CLIENT_ID
    if (!clientId) return NextResponse.json({ error: 'Imgur no está configurado (falta IMGUR_CLIENT_ID en Vercel).' }, { status: 500 })

    return NextResponse.json({ clientId }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'No se pudo comprobar Imgur' }, { status: 500 })
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
