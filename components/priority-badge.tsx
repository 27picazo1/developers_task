import type { TaskPriority } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { priorityBadgeColors, priorityIcons, priorityLabels } from '@/lib/priority-config'

/** Etiqueta de prioridad. Sin valor (datos antiguos) se muestra como "Media". */
export function PriorityBadge({ priority, className }: { priority?: TaskPriority | null; className?: string }) {
  const value = priority ?? 'medium'
  const Icon = priorityIcons[value]
  return (
    <Badge className={cn(priorityBadgeColors[value], className)}>
      <Icon className="size-3" />
      {priorityLabels[value]}
    </Badge>
  )
}
