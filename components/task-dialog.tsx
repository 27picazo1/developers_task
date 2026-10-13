'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link, Loader2, X } from 'lucide-react'
import type { Task, Category, TaskStatus, TaskPriority, TaskType } from '@/lib/types'
import { typeConfig, typeOrder } from '@/lib/task-config'

interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  categories: Category[]
  onSuccess: () => void
  defaultType?: TaskType
  defaultStatus?: TaskStatus
}

export function TaskDialog({ open, onOpenChange, task, categories, onSuccess, defaultType = 'task', defaultStatus = 'pending' }: TaskDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>('pending')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [type, setType] = useState<TaskType>('task')
  const [categoryId, setCategoryId] = useState<string>('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setStatus(task.status)
      setPriority(task.priority)
      setType(task.type ?? 'task')
      setCategoryId(task.category_id || 'none')
    } else {
      setTitle('')
      setDescription('')
      setStatus(defaultStatus)
      setPriority(defaultType === 'bug' ? 'high' : 'medium')
      setType(defaultType)
      setCategoryId('none')
    }
    setImageUrls([])
    setImageUrlInput('')
  }, [task, open, defaultType, defaultStatus])

  const addUrl = () => {
    const url = imageUrlInput.trim()
    if (url && !imageUrls.includes(url)) {
      setImageUrls([...imageUrls, url])
      setImageUrlInput('')
    }
  }

  const uploadImages = async (urls: string[], taskId: string, userId: string) => {
    for (const url of urls) {
      const fileName = url.split('/').pop()?.split('?')[0] || 'imagen'
      const ext = fileName.split('.').pop()?.toLowerCase()
      const fileType = ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
        ? `image/${ext === 'jpg' ? 'jpeg' : ext}`
        : 'image/url'

      const { error: attachmentError } = await supabase.from('attachments').insert({
        task_id: taskId,
        user_id: userId,
        file_name: fileName,
        file_path: url,
        file_type: fileType,
        file_size: 0,
      })

      if (attachmentError) throw attachmentError
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('No hay sesión activa. Recarga la página.')
        setLoading(false)
        return
      }

      const taskData = {
        title,
        description: description || null,
        status,
        priority,
        type,
        category_id: categoryId === 'none' ? null : categoryId,
        // Al editar se conserva el autor original; solo se asigna al crear
        ...(task ? {} : { user_id: user.id }),
        updated_at: new Date().toISOString(),
      }

      let taskId = task?.id

      if (task) {
        const { error: dbError } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', task.id)
        if (dbError) throw dbError
      } else {
        const { data: createdTask, error: dbError } = await supabase
          .from('tasks')
          .insert(taskData)
          .select('id')
          .single()
        if (dbError) throw dbError
        taskId = createdTask.id
      }

      if (imageUrls.length > 0 && taskId) {
        await uploadImages(imageUrls, taskId, user.id)
      }

      setLoading(false)
      setImageUrls([])
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Error desconocido'
      console.error('Error saving task:', err)
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{task ? `Editar ${typeConfig[type].label}` : `Nuevo: ${typeConfig[type].label}`}</DialogTitle>
          <DialogDescription>
            {task ? 'Modifica los detalles' : 'Visible para todo el equipo en cuanto lo crees'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid grid-cols-4 gap-2">
                {typeOrder.map((t) => {
                  const cfg = typeConfig[t]
                  const Icon = cfg.icon
                  const active = type === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs font-medium transition-all ${
                        active
                          ? `${cfg.className} ring-2 ring-offset-2 ring-offset-background ring-current`
                          : 'border-border/60 bg-card/40 text-muted-foreground hover:bg-card/80'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Titulo</Label>
              <Input
                id="title"
                placeholder="ej: Implementar sistema de inventario"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripcion</Label>
              <Textarea
                id="description"
                placeholder="Describe la tarea en detalle..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-image-url">Imagenes de referencia</Label>
              <div className="rounded-lg border border-dashed border-border/70 bg-background/35 p-3">
                <div className="flex gap-2">
                  <Input
                    id="task-image-url"
                    type="url"
                    placeholder="https://i.imgur.com/ejemplo.png"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl() } }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addUrl} disabled={!imageUrlInput.trim()}>
                    <Link className="mr-2 h-4 w-4" />
                    Anadir
                  </Button>
                </div>
                {imageUrls.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {imageUrls.map((url, index) => (
                      <div key={`${url}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                        <span className="truncate">{url}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setImageUrls((urls) => urls.filter((_, i) => i !== index))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Pega enlaces de Imgur, FiveM Manager o cualquier hosting de imagenes.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="in_progress">En Progreso</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoria</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {task ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
