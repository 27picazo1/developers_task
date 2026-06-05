import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
