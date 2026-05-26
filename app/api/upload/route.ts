import { handleUpload, type HandleUploadBody } from '@vercel/blob/next'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) throw new Error('Unauthorized')

        return {
          maximumSizeInBytes: 300 * 1024 * 1024, // 300MB
          allowedContentTypes: [
            'image/*',
            'video/*',
            'application/pdf',
            'application/zip',
            'application/x-zip-compressed',
            'application/x-rar-compressed',
            'application/x-rar',
            'application/vnd.rar',
            'application/x-7z-compressed',
            'application/gzip',
            'application/x-tar',
            'text/plain',
            'text/markdown',
            'application/json',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/octet-stream',
          ],
          tokenPayload: user.id,
        }
      },
      onUploadCompleted: async () => {
        // Metadata is saved by the client after upload() resolves
      },
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    )
  }
}
