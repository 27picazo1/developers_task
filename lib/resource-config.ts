import type { ResourceStatus, ResourceType } from '@/lib/types'

export const typeLabels: Record<ResourceType, string> = { script: 'Script', mlo: 'MLO', vehicle: 'Vehículo', map: 'Mapa', ui: 'UI', tool: 'Herramienta', other: 'Otro' }
export const typeColors: Record<ResourceType, string> = { script: 'bg-primary/10 text-primary', mlo: 'bg-violet-500/10 text-violet-300', vehicle: 'bg-amber-500/10 text-amber-300', map: 'bg-sky-500/10 text-sky-300', ui: 'bg-pink-500/10 text-pink-300', tool: 'bg-orange-500/10 text-orange-300', other: 'bg-muted text-muted-foreground' }
export const statusLabels: Record<ResourceStatus, string> = { pending: 'Pendiente', in_progress: 'En progreso', implemented: 'Implementado' }
export const statusColors: Record<ResourceStatus, string> = { pending: 'bg-blue-500/10 text-blue-400', in_progress: 'bg-amber-500/10 text-amber-300', implemented: 'bg-emerald-500/10 text-emerald-300' }

export const MAX_IMAGES = 8
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
