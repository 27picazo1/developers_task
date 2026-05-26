'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TaskWithRelations, Subtask, Comment, Attachment, Category, TaskStatus, TaskPriority } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Trash2,
  Upload,
  FileText,
  Image as ImageIcon,
  Video,
  FileArchive,
  Download,
  Send,
  Loader2,
  X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface TaskDetailProps {
  task: TaskWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  onUpdate: () => void
  onDelete: () => void
}

const statusConfig = {
  pending: { label: 'Pendiente', icon: Circle, className: 'bg-blue-500/10 text-blue-400' },
  in_progress: { label: 'En Progreso', icon: Clock, className: 'bg-amber-500/10 text-amber-400' },
  completed: { label: 'Completada', icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-400' },
}

export function TaskDetail({ task, open, onOpenChange, categories, onUpdate, onDelete }: TaskDetailProps) {
  const [newSubtask, setNewSubtask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  if (!task) return null

  const status = statusConfig[task.status]
  const StatusIcon = status.icon
  const completedSubtasks = task.subtasks.filter((s) => s.completed).length

  const handleStatusChange = async (newStatus: TaskStatus) => {
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    onUpdate()
  }

  const handlePriorityChange = async (newPriority: TaskPriority) => {
    await supabase.from('tasks').update({ priority: newPriority }).eq('id', task.id)
    onUpdate()
  }

  const handleCategoryChange = async (categoryId: string) => {
    await supabase.from('tasks').update({ category_id: categoryId === 'none' ? null : categoryId }).eq('id', task.id)
    onUpdate()
  }

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtask.trim()) return
    await supabase.from('subtasks').insert({ task_id: task.id, title: newSubtask.trim() })
    setNewSubtask('')
    onUpdate()
  }

  const handleToggleSubtask = async (subtask: Subtask) => {
    await supabase.from('subtasks').update({ completed: !subtask.completed }).eq('id', subtask.id)
    onUpdate()
  }

  const handleDeleteSubtask = async (subtaskId: string) => {
    await supabase.from('subtasks').delete().eq('id', subtaskId)
    onUpdate()
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('comments').insert({
      task_id: task.id,
      user_id: user.id,
      content: newComment.trim(),
    })
    setNewComment('')
    onUpdate()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    for (const file of Array.from(files) as File[]) {
      try {
        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
        const storagePath = `${user.id}/${timestamp}-${safeName}`

        const { data, error } = await supabase.storage
          .from('attachments')
          .upload(storagePath, file)

        if (error) throw error

        await supabase.from('attachments').insert({
          task_id: task.id,
          user_id: user.id,
          file_name: file.name,
          file_path: data.path,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
        })
      } catch (err) {
        console.error('Upload error:', err)
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    onUpdate()
  }

  const handleDeleteAttachment = async (attachment: Attachment) => {
    await fetch('/api/delete', {
      method: 'DELETE',
      body: JSON.stringify({ pathname: attachment.file_path }),
    })
    await supabase.from('attachments').delete().eq('id', attachment.id)
    onUpdate()
  }

  const handleDeleteTask = async () => {
    setDeleting(true)
    // Delete all attachments from blob storage
    for (const attachment of task.attachments) {
      await fetch('/api/delete', {
        method: 'DELETE',
        body: JSON.stringify({ pathname: attachment.file_path }),
      })
    }
    await supabase.from('tasks').delete().eq('id', task.id)
    setDeleting(false)
    setDeleteConfirm(false)
    onOpenChange(false)
    onDelete()
  }

  const fileUrl = (path: string) =>
    path.startsWith('http') ? path : `/api/file?pathname=${encodeURIComponent(path)}`
  const isImage = (fileType: string) => fileType.startsWith('image/')
  const isVideo = (fileType: string) => fileType.startsWith('video/')
  const isArchive = (fileType: string) => ['application/zip', 'application/x-rar-compressed', 'application/x-rar', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar'].includes(fileType) || /\.(zip|rar|7z|tar|gz)$/i.test(fileType)
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="space-y-4 pb-6">
            <div className="flex items-start justify-between gap-4">
              <SheetTitle className="text-xl text-pretty leading-tight">{task.title}</SheetTitle>
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground">{task.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Select value={task.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-auto h-8 text-xs">
                  <Badge variant="outline" className={status.className}>
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {status.label}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={task.priority} onValueChange={handlePriorityChange}>
                <SelectTrigger className="w-auto h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Prioridad Baja</SelectItem>
                  <SelectItem value="medium">Prioridad Media</SelectItem>
                  <SelectItem value="high">Prioridad Alta</SelectItem>
                </SelectContent>
              </Select>
              <Select value={task.category_id || 'none'} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-auto h-8 text-xs">
                  <SelectValue placeholder="Sin categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoria</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SheetHeader>

          <div className="space-y-6">
            {/* Subtasks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Subtareas {task.subtasks.length > 0 && `(${completedSubtasks}/${task.subtasks.length})`}
                </h3>
              </div>
              {task.subtasks.length > 0 && (
                <div className="rounded-lg border border-border/50 divide-y divide-border/50">
                  {task.subtasks.map((subtask) => (
                    <div key={subtask.id} className="flex items-center gap-3 p-3 group">
                      <Checkbox
                        checked={subtask.completed}
                        onCheckedChange={() => handleToggleSubtask(subtask)}
                      />
                      <span className={`flex-1 text-sm ${subtask.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {subtask.title}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={() => handleDeleteSubtask(subtask.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddSubtask} className="flex gap-2">
                <Input
                  placeholder="Añadir subtarea..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  className="h-9"
                />
                <Button type="submit" size="sm" variant="secondary">
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
            </div>

            {/* Attachments */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Archivos {task.attachments.length > 0 && `(${task.attachments.length})`}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Subir
                    </>
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.lua,.js,.ts,.json,.rar,.zip,.7z,.tar,.gz"
                />
              </div>
              {task.attachments.length > 0 && (
                <div className="grid gap-2">
                  {task.attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-3 rounded-lg border border-border/50 p-3 group"
                    >
                      {isImage(attachment.file_type) ? (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={fileUrl(attachment.file_path)}
                            alt={attachment.file_name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : isVideo(attachment.file_type) ? (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <Video className="h-5 w-5 text-muted-foreground" />
                        </div>
                      ) : isArchive(attachment.file_type) ? (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <FileArchive className="h-5 w-5 text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(attachment.file_size)}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <a
                            href={fileUrl(attachment.file_path)}
                            download={attachment.file_name}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteAttachment(attachment)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {task.attachments.filter((a) => isImage(a.file_type)).length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  {task.attachments
                    .filter((a) => isImage(a.file_type))
                    .map((attachment) => (
                      <a
                        key={attachment.id}
                        href={fileUrl(attachment.file_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg overflow-hidden border border-border/50 hover:border-primary/50 transition-colors"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={fileUrl(attachment.file_path)}
                          alt={attachment.file_name}
                          className="w-full h-32 object-cover"
                        />
                      </a>
                    ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">
                Comentarios {task.comments.length > 0 && `(${task.comments.length})`}
              </h3>
              {task.comments.length > 0 && (
                <div className="space-y-3">
                  {task.comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {comment.profile?.display_name?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {comment.profile?.display_name || 'Usuario'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddComment} className="flex gap-2">
                <Textarea
                  placeholder="Escribe un comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
                <Button type="submit" size="icon" className="shrink-0 self-end">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>

            {/* Delete Task */}
            <div className="pt-4 border-t border-border/50">
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar Tarea
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarea</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. Se eliminaran todos los comentarios, subtareas y archivos adjuntos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
