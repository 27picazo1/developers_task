import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccessStatus } from '@/lib/access'
import { can } from '@/lib/roles'
import { ResourcesClient } from './resources-client'

export default async function ResourcesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const access = await getAccessStatus(supabase, user.id)
  if (!access.isMember) redirect('/acceso')

  // Soporte no tiene Recursos.
  const role = access.role
  if (!role || !can.viewResources(role)) redirect('/dashboard')

  // list_resources() devuelve los recursos ya recortados según el rango:
  // el moderador nunca recibe enlaces, descargas, notas ni rutas de archivos.
  const [{ data: profile }, { data: resources }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.rpc('list_resources'),
  ])

  return <ResourcesClient profile={profile} role={role} initialResources={(resources as never[]) ?? []} />
}
