import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const publicBaseUrl = process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL

function getR2Key(pathname: string) {
  if (publicBaseUrl && pathname.startsWith(publicBaseUrl)) {
    return decodeURIComponent(new URL(pathname).pathname.replace(/^\/+/, ''))
  }

  return null
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { pathname } = await request.json()

    if (!pathname) {
      return NextResponse.json({ error: 'No pathname provided' }, { status: 400 })
    }

    if (!pathname.includes(user.id)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const r2Key = getR2Key(pathname)

    if (r2Key && process.env.R2_BUCKET_NAME) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
      }))
    } else {
      const { error } = await supabase.storage.from('attachments').remove([pathname])
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
