export type Role = 'admin' | 'moderator' | 'support'

export const ROLES: Role[] = ['admin', 'moderator', 'support']

export const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  moderator: 'Moderador',
  support: 'Soporte',
}

export const roleBadgeClasses: Record<Role, string> = {
  admin: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  moderator: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  support: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
}

/** Acepta valores antiguos ('member') y desconocidos. */
export function normalizeRole(value: unknown): Role {
  if (value === 'admin' || value === 'moderator' || value === 'support') return value
  return 'support'
}

/**
 * Permisos por rango. Es la única fuente de verdad en el cliente y en las
 * rutas /api; la barrera real está en Supabase (ver migración 20261022000000_roles.sql).
 */
export const can = {
  manageMembers: (r?: Role | null) => r === 'admin',
  manageCredentials: (r?: Role | null) => r === 'admin',
  viewResources: (r?: Role | null) => r === 'admin' || r === 'moderator',
  editResources: (r?: Role | null) => r === 'admin',
  downloadResources: (r?: Role | null) => r === 'admin',
  openReferences: (r?: Role | null) => r === 'admin',
}
