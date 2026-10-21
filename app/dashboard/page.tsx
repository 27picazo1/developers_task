import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Registrarse no basta: hace falta una credencial de acceso vigente.
  const access = await getAccessStatus(supabase, user.id)
  if (!access.isMember) {
    redirect('/acceso')
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Workspace compartido: se cargan las categorías, tareas y perfiles de TODO el equipo
  // (el acceso real lo controlan las políticas RLS de Supabase, ver supabase/shared-workspace.sql)
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('created_at', { ascending: true })

  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      *,
      category:categories(*),
      subtasks(*),
      comments(*),
      attachments(*)
    `)
    .order('created_at', { ascending: false })

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')

  return (
    <DashboardClient
      profile={profile}
      role={access.role ?? 'support'}
      initialCategories={categories || []}
      initialTasks={tasks || []}
      initialProfiles={profiles || []}
    />
  )
}
