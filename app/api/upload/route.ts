import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
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
const resourceImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const maxResourceImageSize = 8 * 1024 * 1024
const maxResourceFileSize = 700 * 1024 * 1024
const maxMultipartParts = 10000

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

    const access = await getAccessStatus(supabase, user.id)
    if (!access.isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Solo el admin crea recursos, así que solo él sube sus archivos.
    if (!can.editResources(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!process.env.R2_BUCKET_NAME) {
      return NextResponse.json({ error: 'R2 is not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { action, filename, contentType, fileSize, purpose } = body

    if (action === 'sign-part' || action === 'complete' || action === 'abort') {
      const { key, uploadId } = body
      if (
        typeof key !== 'string' ||
        !key.startsWith(`r2/${user.id}/`) ||
        typeof uploadId !== 'string' ||
        !uploadId
      ) {
        return NextResponse.json({ error: 'Invalid multipart upload.' }, { status: 400 })
      }

      if (action === 'sign-part') {
        const { partNumber } = body
        if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > maxMultipartParts) {
          return NextResponse.json({ error: 'Invalid part number.' }, { status: 400 })
        }
        const uploadUrl = await getSignedUrl(s3, new UploadPartCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }), { expiresIn: 3600 })
        return NextResponse.json({ uploadUrl })
      }

      if (action === 'complete') {
        const { parts } = body
        if (
          !Array.isArray(parts) ||
          !parts.length ||
          parts.length > maxMultipartParts ||
          parts.some((part) =>
            !Number.isInteger(part.PartNumber) ||
            part.PartNumber < 1 ||
            part.PartNumber > maxMultipartParts ||
            typeof part.ETag !== 'string' ||
            !part.ETag,
          )
        ) {
          return NextResponse.json({ error: 'Invalid multipart parts.' }, { status: 400 })
        }
        await s3.send(new CompleteMultipartUploadCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }))
        return NextResponse.json({ success: true })
      }

      await s3.send(new AbortMultipartUploadCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      }))
      return NextResponse.json({ success: true })
    }

    if (typeof filename !== 'string' || !filename.trim()) {
      return NextResponse.json({ error: 'Missing filename' }, { status: 400 })
    }

    if (purpose !== 'resource-image' && purpose !== 'resource-file') {
      return NextResponse.json({ error: 'Unsupported upload purpose' }, { status: 400 })
    }

    if (
      typeof contentType !== 'string' ||
      !contentType.trim() ||
      contentType.length > 255 ||
      !Number.isInteger(fileSize) ||
      fileSize < 1 ||
      fileSize > maxResourceFileSize
    ) {
      return NextResponse.json({ error: 'Unsupported file or size (maximum 700 MB).' }, { status: 400 })
    }

    if (purpose === 'resource-image' && (
      !resourceImageTypes.includes(contentType) ||
      fileSize > maxResourceImageSize
    )) {
      return NextResponse.json({ error: 'Unsupported image format or size (maximum 8 MB).' }, { status: 400 })
    }

    const key = `r2/${user.id}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(filename)}`

    if (purpose === 'resource-file') {
      const multipart = await s3.send(new CreateMultipartUploadCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      }))
      if (!multipart.UploadId) throw new Error('R2 no devolvió un identificador para la carga multipart.')
      return NextResponse.json({ key, uploadId: multipart.UploadId, partSize: 16 * 1024 * 1024 })
    }

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
