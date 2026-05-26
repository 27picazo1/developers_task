import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size (max 300MB — Vercel Blob supports it, but note that
    // Vercel serverless functions have a 4.5MB request body limit on the free plan.
    // For large files, consider upgrading to Vercel Pro or using direct client upload.
    if (file.size > 300 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 300MB)' }, { status: 400 })
    }

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const pathname = `tasks/${user.id}/${timestamp}-${safeName}`

    const blob = await put(pathname, file, {
      access: 'public',
    })

    return NextResponse.json({
      pathname: blob.pathname,
      url: blob.url,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Upload failed'
    console.error('Upload error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
