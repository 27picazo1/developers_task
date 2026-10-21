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
