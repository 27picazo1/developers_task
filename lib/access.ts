import type { SupabaseClient } from '@supabase/supabase-js'

export interface AccessStatus {
  /** Tiene acceso vigente al espacio de trabajo. */
  isMember: boolean
  isAdmin: boolean
  /** Tuvo un acceso temporal y ya ha caducado. */
  expired: boolean
  /** null = permanente. */
  expiresAt: string | null
}

/**
 * Estado de acceso del usuario. La barrera de verdad está en las políticas RLS
 * de Supabase (supabase/migrations/20261020010000_access_credentials.sql);
 * esto solo decide qué pantalla enseñar y protege las rutas /api.
 */
export async function getAccessStatus(supabase: SupabaseClient, userId: string): Promise<AccessStatus> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    // Migración aún sin ejecutar: no se bloquea a todo el mundo fuera de la app.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return { isMember: true, isAdmin: false, expired: false, expiresAt: null }
    }
    return { isMember: false, isAdmin: false, expired: false, expiresAt: null }
  }

  if (!data) {
    return { isMember: false, isAdmin: false, expired: false, expiresAt: null }
  }

  const expired = !!data.expires_at && new Date(data.expires_at).getTime() <= Date.now()
  return {
    isMember: !expired,
    isAdmin: data.role === 'admin' && !expired,
    expired,
    expiresAt: data.expires_at,
  }
}
