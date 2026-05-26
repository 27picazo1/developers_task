'use client'

import type { Task, Category } from '@/lib/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Clock, AlertTriangle, MessageSquare, Paperclip, CheckSquare } from 'lucide-react'

interface TaskCardProps {
  task: Task
  onClick: () => void
}

const statusConfig = {
  pending: { label: 'Pendiente', icon: Circle, className: 'bg-blue-500/10 text-blue-400' },
  in_progress: { label: 'En Progreso', icon: Clock, className: 'bg-amber-500/10 text-amber-400' },
  completed: { label: 'Completada', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-400' },
}

const priorityConfig = {
  low: { label: 'Baja', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  medium: { label: 'Media', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  high: { label: 'Alta', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const status = statusConfig[task.status]
  const priority = priorityConfig[task.priority]
  const StatusIcon = status.icon

  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const commentsCount = task.comments?.length || 0
  const attachmentsCount = task.attachments?.length || 0

  return (
    <Card
      className="group cursor-pointer border-border/50 bg-card/50 transition-all hover:border-primary/30 hover:bg-card"
      onClick={onClick}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-tight text-balance group-hover:text-primary transition-colors">
            {task.title}
          </h3>
          {task.priority === 'high' && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={status.className}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {status.label}
          </Badge>
          <Badge variant="outline" className={priority.className}>
            {priority.label}
          </Badge>
          {task.category && (
            <Badge
              variant="outline"
              className="border-transparent"
              style={{
                backgroundColor: `${task.category.color}15`,
                color: task.category.color,
              }}
            >
              {task.category.name}
            </Badge>
          )}
        </div>

        {(totalSubtasks > 0 || commentsCount > 0 || attachmentsCount > 0) && (
          <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            {totalSubtasks > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="h-3.5 w-3.5" />
                {completedSubtasks}/{totalSubtasks}
              </span>
            )}
            {commentsCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {commentsCount}
              </span>
            )}
            {attachmentsCount > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {attachmentsCount}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
