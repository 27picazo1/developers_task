import { ChevronDown, ChevronUp, Minus, type LucideIcon } from 'lucide-react'
import type { TaskPriority } from '@/lib/types'

/** Prioridades compartidas por tareas y recursos. */
export const priorityLabels: Record<TaskPriority, string> = { low: 'Baja', medium: 'Media', high: 'Alta' }

export const priorityIcons: Record<TaskPriority, LucideIcon> = { low: ChevronDown, medium: Minus, high: ChevronUp }

/** Etiqueta con forma de píldora (mismos colores que el indicador de las tarjetas de tareas). */
export const priorityBadgeColors: Record<TaskPriority, string> = {
  low: 'rounded-full border-blue-500/50 bg-blue-500/15 text-blue-300',
  medium: 'rounded-full border-amber-500/50 bg-amber-500/15 text-amber-300',
  high: 'rounded-full border-red-500/50 bg-red-500/15 text-red-300',
}

const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 }

/** Para ordenar de más a menos prioritario: `items.sort((a, b) => comparePriority(a.priority, b.priority))`. */
export const comparePriority = (a?: TaskPriority | null, b?: TaskPriority | null) =>
  priorityRank[a ?? 'medium'] - priorityRank[b ?? 'medium']
