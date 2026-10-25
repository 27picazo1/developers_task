import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { can } from '@/lib/roles'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const publicBaseUrl = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL

// Las imágenes se sirven a través de nuestro servidor en lugar de redirigir a R2:
// algunas redes (p. ej. bloqueos de IPs de Cloudflare en España durante partidos)
// no llegan a *.r2.cloudflarestorage.com y la imagen se queda en "timeout".
const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
const STREAM_MAX_BYTES = 12 * 1024 * 1024

async function streamImage(key: string): Promise<NextResponse | null> {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  if (!IMAGE_MIME[ext]) return null
  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }))
    const body = object.Body
    if (!body) return null
    if ((object.ContentLength ?? 0) > STREAM_MAX_BYTES) {
      // Demasiado grande para pasar por aquí: se cierra y se usa la redirección de siempre.
      ;(body as { destroy?: () => void }).destroy?.()
      return null
    }
    const storedType = object.ContentType ?? ''
    const type = storedType.startsWith('image/') && !storedType.startsWith('image/svg') ? storedType : IMAGE_MIME[ext]
    return new NextResponse(body.transformToWebStream(), {
      headers: {
        'Content-Type': type,
        ...(object.ContentLength ? { 'Content-Length': String(object.ContentLength) } : {}),
        // Cada archivo tiene una clave única: se puede cachear en el navegador.
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (error) {
    console.error('Error sirviendo imagen desde R2, se usa la redirección:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
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

    const pathname = request.nextUrl.searchParams.get('pathname')
    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // Archivos de recursos: el rango decide. Admin → todo; moderador → solo
    // imágenes (para verlas, no para descargar archivos); soporte → nada.
    // Si la migración de rangos aún no está ejecutada, la RPC falla y se aplica la regla antigua.
    const { data: fileAccess } = await supabase.rpc('resource_file_access', { p_path: pathname })
    if (fileAccess === 'denied' || (fileAccess === 'allowed' && !can.viewResources(access.role))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (fileAccess !== 'allowed' && !pathname.includes(user.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (pathname.startsWith('r2/') && process.env.R2_BUCKET_NAME) {
      const streamed = await streamImage(pathname)
      if (streamed) return streamed

      if (publicBaseUrl) {
        return NextResponse.redirect(`${publicBaseUrl.replace(/\/$/, '')}/${pathname}`)
      }

      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: pathname,
      })
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 })

      return NextResponse.redirect(signedUrl)
    }

    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(pathname, 3600)

    if (error || !data?.signedUrl) {
      return new NextResponse('Not found', { status: 404 })
    }

    return NextResponse.redirect(data.signedUrl)
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
