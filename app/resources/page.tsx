import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { ResourcesClient } from './resources-client'

export default async function ResourcesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const access = await getAccessStatus(supabase, user.id)
  if (!access.isMember) redirect('/acceso')

  const [{ data: profile }, { data: resources }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('resources').select('*, resource_attachments(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  return <ResourcesClient profile={profile} initialResources={resources ?? []} />
}
