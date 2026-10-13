import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
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
const resourceImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const maxResourceImageSize = 8 * 1024 * 1024
const maxResourceFileSize = 50 * 1024 * 1024

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { filename, contentType, fileSize, purpose } = await request.json()

    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'Missing filename' }, { status: 400 })
    }

    if (purpose === 'resource-image' && (
      !resourceImageTypes.includes(contentType) ||
      !Number.isInteger(fileSize) ||
      fileSize < 1 ||
      fileSize > maxResourceImageSize
    )) {
      return NextResponse.json({ error: 'Unsupported image format or size (maximum 8 MB).' }, { status: 400 })
    }

    if (purpose === 'resource-file' && (
      typeof contentType !== 'string' ||
      contentType.length > 255 ||
      !Number.isInteger(fileSize) ||
      fileSize < 1 ||
      fileSize > maxResourceFileSize
    )) {
      return NextResponse.json({ error: 'Unsupported file or size (maximum 50 MB).' }, { status: 400 })
    }

    if (!process.env.R2_BUCKET_NAME) {
      return NextResponse.json({ error: 'R2 is not configured' }, { status: 500 })
    }

    const key = `r2/${user.id}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(filename)}`

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    })

    // Genera un enlace valido solo por 5 minutos para subir el archivo.
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    const fileUrl = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${key}` : null

    return NextResponse.json({ uploadUrl, fileUrl, key })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload URL generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
