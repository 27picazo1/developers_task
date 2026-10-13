'use client'

import type { Task, Profile } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getType } from '@/lib/task-config'
import { MessageSquare, Paperclip, CheckSquare, Flame, ChevronUp, Minus, ChevronDown } from 'lucide-react'

interface TaskCardProps {
  task: Task
  author?: Profile | null
  onClick: () => void
  draggable?: boolean
  dragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}

const priorityConfig = {
  low: { label: 'Baja', icon: ChevronDown, className: 'text-blue-400' },
  medium: { label: 'Media', icon: Minus, className: 'text-amber-400' },
  high: { label: 'Alta', icon: ChevronUp, className: 'text-red-400' },
}

export function authorName(author?: Profile | null) {
  return author?.display_name || author?.email?.split('@')[0] || 'Usuario'
}

export function TaskCard({ task, author, onClick, draggable, dragging, onDragStart, onDragEnd }: TaskCardProps) {
  const type = getType(task.type)
  const TypeIcon = type.icon
  const priority = priorityConfig[task.priority]
  const PriorityIcon = priority.icon
  const coverImage = task.attachments?.find((attachment) => attachment.file_type.startsWith('image/'))

  const completedSubtasks = task.subtasks?.filter((s) => s.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0
  const commentsCount = task.comments?.length || 0
  const attachmentsCount = task.attachments?.length || 0
  const progress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0
  const fileUrl = (path: string) =>
    path.startsWith('http') ? path : `/api/file?pathname=${encodeURIComponent(path)}`
  const name = authorName(author)

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border/60 bg-card/80 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-[0_14px_36px_rgba(0,0,0,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        dragging ? 'rotate-1 opacity-40' : ''
      } ${draggable ? 'active:cursor-grabbing' : ''}`}
    >
      {/* Franja de color según el tipo */}
      <span className={`absolute inset-y-0 left-0 w-1 ${type.accent}`} />

      {coverImage && (
        <div className="relative h-28 overflow-hidden border-b border-border/50 bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(coverImage.file_path)}
            alt={coverImage.file_name}
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="space-y-3 p-3 pl-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={type.className}>
            <TypeIcon className="mr-1 h-3 w-3" />
            {type.label}
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
          {task.priority === 'high' && (
            <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-300">
              <Flame className="mr-1 h-3 w-3" />
              Urgente
            </Badge>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-snug text-balance transition-colors group-hover:text-primary">
            {task.title}
          </h3>
          {task.description && (
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p>
          )}
        </div>

        {totalSubtasks > 0 && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-0.5 ${priority.className}`} title={`Prioridad ${priority.label}`}>
              <PriorityIcon className="h-3.5 w-3.5" />
              {priority.label}
            </span>
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
          <div className="flex min-w-0 items-center gap-1.5" title={`Creado por ${name}`}>
            <Avatar className="h-5 w-5">
              <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
                {name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[80px] truncate">{name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
