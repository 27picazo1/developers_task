import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { AccesoClient } from './acceso-client'

export default async function AccesoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const access = await getAccessStatus(supabase, user.id)
  if (access.isMember) {
    redirect('/dashboard')
  }

  return <AccesoClient email={user.email ?? ''} expired={access.expired} />
}
