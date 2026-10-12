'use client'

import type { Task } from '@/lib/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Clock, AlertTriangle, MessageSquare, Paperclip, CheckSquare, ArrowUpRight } from 'lucide-react'

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
  const coverImage = task.attachments?.find((attachment) => attachment.file_type.startsWith('image/'))

  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const commentsCount = task.comments?.length || 0
  const attachmentsCount = task.attachments?.length || 0
  const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0
  const fileUrl = (path: string) =>
    path.startsWith('http') ? path : `/api/file?pathname=${encodeURIComponent(path)}`

  return (
    <Card
      className="group cursor-pointer gap-0 overflow-hidden rounded-lg border-border/60 bg-card/70 py-0 shadow-none transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-[0_18px_45px_rgba(0,0,0,0.22)]"
      onClick={onClick}
    >
      <div className="h-1 w-full bg-muted/40">
        <div
          className={`h-full ${task.status === 'completed' ? 'bg-emerald-400' : task.status === 'in_progress' ? 'bg-amber-400' : 'bg-blue-400'}`}
          style={{ width: totalSubtasks > 0 ? `${progress}%` : task.status === 'completed' ? '100%' : task.status === 'in_progress' ? '55%' : '22%' }}
        />
      </div>
      {coverImage && (
        <div className="relative h-36 overflow-hidden border-b border-border/50 bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(coverImage.file_path)}
            alt={coverImage.file_name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/65 via-transparent to-transparent" />
        </div>
      )}
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={status.className}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {status.label}
              </Badge>
              {task.priority === 'high' && (
                <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-300">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Bloqueante
                </Badge>
              )}
            </div>
            <h3 className="text-base font-semibold leading-tight text-balance transition-colors group-hover:text-primary">
              {task.title}
            </h3>
          </div>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:text-primary group-hover:opacity-100" />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={priority.className}>
            Prioridad {priority.label}
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
          <div className="flex items-center gap-3 border-t border-border/50 pt-3 text-xs text-muted-foreground">
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
