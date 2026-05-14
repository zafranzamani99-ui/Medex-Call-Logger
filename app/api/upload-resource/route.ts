import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

const BUCKET = 'resource-files'
const MAX_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_EXTENSIONS = ['.bat', '.cmd', '.ps1', '.sh', '.txt']

export async function POST(req: NextRequest) {
  const userClient = createServerClient()
  const { data: userRes } = await userClient.auth.getUser()
  if (!userRes?.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const supabase = createClient(url, serviceKey)

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '')
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Only ${ALLOWED_EXTENSIONS.join(', ')} files are allowed` }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `resources/${today}/${crypto.randomUUID()}_${safeName}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: 'text/plain',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filename)

    return NextResponse.json({ url: publicUrl, filename: file.name })
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
