import type { ResourceStatus, ResourceType } from '@/lib/types'

export const typeLabels: Record<ResourceType, string> = { script: 'Script', mlo: 'MLO', vehicle: 'Vehículo', map: 'Mapa', ui: 'UI', tool: 'Herramienta', other: 'Otro' }
export const typeColors: Record<ResourceType, string> = { script: 'rounded-full border-emerald-500/50 bg-emerald-500/15 text-emerald-300', mlo: 'rounded-full border-violet-500/50 bg-violet-500/20 text-violet-300', vehicle: 'rounded-full border-sky-500/50 bg-sky-500/15 text-sky-300', map: 'rounded-full border-sky-500/50 bg-sky-500/15 text-sky-300', ui: 'rounded-full border-purple-500/50 bg-purple-500/20 text-purple-300', tool: 'rounded-full border-amber-500/50 bg-amber-500/15 text-amber-300', other: 'rounded-full border-border bg-muted text-muted-foreground' }
export const statusLabels: Record<ResourceStatus, string> = { pending: 'Pendiente', in_progress: 'En progreso', implemented: 'Implementado' }
export const statusColors: Record<ResourceStatus, string> = { pending: 'rounded-full border-border bg-secondary/60 text-foreground', in_progress: 'rounded-full border-amber-500/50 bg-amber-500/15 text-amber-300', implemented: 'rounded-full border-border bg-secondary/60 text-foreground' }

export const MAX_IMAGES = 8
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
