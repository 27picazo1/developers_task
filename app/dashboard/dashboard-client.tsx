'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Category, Task, TaskWithRelations, TaskStatus } from '@/lib/types'
import { Header } from '@/components/header'
import { TaskCard } from '@/components/task-card'
import { TaskDialog } from '@/components/task-dialog'
import { TaskDetail } from '@/components/task-detail'
import { CategoryDialog } from '@/components/category-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  Tag,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Activity,
  Flame,
  GitBranch,
  ServerCog,
  TerminalSquare,
  UploadCloud,
} from 'lucide-react'

interface DashboardClientProps {
  profile: Profile | null
  initialCategories: Category[]
  initialTasks: TaskWithRelations[]
}

type FilterStatus = 'all' | TaskStatus

export function DashboardClient({ profile, initialCategories, initialTasks }: DashboardClientProps) {
  const [categories, setCategories] = useState(initialCategories)
  const [tasks, setTasks] = useState(initialTasks)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)
  
  const [loading, setLoading] = useState(false)
  
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [categoriesRes, tasksRes] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('tasks')
          .select(`
            *,
            category:categories(*),
            subtasks(*),
            comments(*),
            attachments(*)
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      if (categoriesRes.data) setCategories(categoriesRes.data)
      if (tasksRes.data) {
        setTasks(tasksRes.data as TaskWithRelations[])
        if (selectedTask) {
          const updated = tasksRes.data.find((t) => t.id === selectedTask.id)
          if (updated) setSelectedTask(updated as TaskWithRelations)
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase, selectedTask])

  const handleDeleteCategory = async (category: Category) => {
    await supabase.from('categories').delete().eq('id', category.id)
    fetchData()
  }

  const handleTaskClick = (task: TaskWithRelations) => {
    setSelectedTask(task)
    setTaskDetailOpen(true)
  }

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title.toLowerCase().includes(search.toLowerCase()) ||
      task.description?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = filterStatus === 'all' || task.status === filterStatus
    const matchesCategory = !filterCategory || task.category_id === filterCategory
    return matchesSearch && matchesStatus && matchesCategory
  })

  const statusCounts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  }
  const highPriorityCount = tasks.filter((t) => t.priority === 'high').length
  const attachmentsCount = tasks.reduce((count, task) => count + (task.attachments?.length || 0), 0)

  return (
    <div className="min-h-screen bg-background">
      <Header profile={profile} />
      
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-6 overflow-hidden rounded-lg border border-border/60 bg-card/40">
          <div className="grid gap-0 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="relative p-5 sm:p-6">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(52,211,153,0.14),transparent_42%),linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[length:auto,28px_28px,28px_28px]" />
              <div className="relative">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                    <ServerCog className="mr-1 h-3 w-3" />
                    Workspace FiveM
                  </Badge>
                  <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-300">
                    <Activity className="mr-1 h-3 w-3" />
                    {statusCounts.in_progress} en progreso
                  </Badge>
                </div>
                <div className="max-w-3xl space-y-3">
                  <h1 className="text-2xl font-semibold tracking-normal text-balance sm:text-3xl">
                    Panel de desarrollo para scripts, fixes y releases de FiveM.
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Prioriza bugs, organiza recursos por categoria y adjunta builds pesadas sin pasar por el limite de Vercel.
                  </p>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-border/60 bg-background/45 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <TerminalSquare className="h-3.5 w-3.5 text-primary" />
                      Backlog total
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{tasks.length}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/45 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Flame className="h-3.5 w-3.5 text-red-300" />
                      Alta prioridad
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{highPriorityCount}</p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/45 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <UploadCloud className="h-3.5 w-3.5 text-sky-300" />
                      Archivos
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{attachmentsCount}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-border/60 bg-background/30 p-5 lg:border-l lg:border-t-0">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Estado del sprint</p>
                  <p className="text-xs text-muted-foreground">Vista rapida del pipeline</p>
                </div>
                <GitBranch className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Pendientes', value: statusCounts.pending, color: 'bg-blue-400' },
                  { label: 'En progreso', value: statusCounts.in_progress, color: 'bg-amber-400' },
                  { label: 'Completadas', value: statusCounts.completed, color: 'bg-emerald-400' },
                ].map((item) => {
                  const width = tasks.length > 0 ? Math.max(8, Math.round((item.value / tasks.length) * 100)) : 0
                  return (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium">{item.value}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                        <div className={`h-full rounded-full ${item.color}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}
            className={`flex min-h-24 items-center gap-3 rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 ${
              filterStatus === 'pending' ? 'border-blue-500/50 bg-blue-500/10' : 'border-border/60 bg-card/45 hover:bg-card/70'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <Circle className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold">{statusCounts.pending}</p>
              <p className="text-sm text-muted-foreground">Por revisar</p>
            </div>
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}
            className={`flex min-h-24 items-center gap-3 rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 ${
              filterStatus === 'in_progress' ? 'border-amber-500/50 bg-amber-500/10' : 'border-border/60 bg-card/45 hover:bg-card/70'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
              <Clock className="h-5 w-5 text-amber-400" />
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold">{statusCounts.in_progress}</p>
              <p className="text-sm text-muted-foreground">En Progreso</p>
            </div>
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === 'completed' ? 'all' : 'completed')}
            className={`flex min-h-24 items-center gap-3 rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 ${
              filterStatus === 'completed' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-border/60 bg-card/45 hover:bg-card/70'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold">{statusCounts.completed}</p>
              <p className="text-sm text-muted-foreground">Completadas</p>
            </div>
          </button>
        </div>

        {/* Toolbar */}
        <div className="mb-5 flex flex-col gap-4 rounded-lg border border-border/60 bg-card/35 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar tareas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingCategory(null)
                setCategoryDialogOpen(true)
              }}
            >
              <Tag className="mr-2 h-4 w-4" />
              Categoria
            </Button>
            <Button size="sm" onClick={() => setTaskDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Tarea
            </Button>
          </div>
        </div>

        {/* Categories filter */}
        {categories.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtrar por:</span>
            <Badge
              variant={filterCategory === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilterCategory(null)}
            >
              Todas
            </Badge>
            {categories.map((category) => (
              <DropdownMenu key={category.id}>
                <DropdownMenuTrigger asChild>
                  <Badge
                    variant="outline"
                    className={`cursor-pointer ${filterCategory === category.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                    style={{
                      backgroundColor: `${category.color}15`,
                      borderColor: `${category.color}50`,
                      color: category.color,
                    }}
                    onClick={() => setFilterCategory(filterCategory === category.id ? null : category.id)}
                  >
                    {category.name}
                    <MoreHorizontal className="ml-1 h-3 w-3" />
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditingCategory(category)
                      setCategoryDialogOpen(true)
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDeleteCategory(category)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>
        )}

        {/* Tasks grid */}
        {filteredTasks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} onClick={() => handleTaskClick(task)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted/50 p-4">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-lg font-medium">
              {tasks.length === 0 ? 'No hay tareas' : 'Sin resultados'}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {tasks.length === 0
                ? 'Crea tu primera tarea para empezar'
                : 'Prueba con otros filtros o busqueda'}
            </p>
            {tasks.length === 0 && (
              <Button onClick={() => setTaskDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva Tarea
              </Button>
            )}
          </div>
        )}
      </main>

      {/* Dialogs */}
      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        categories={categories}
        onSuccess={fetchData}
      />

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        onSuccess={fetchData}
      />

      <TaskDetail
        task={selectedTask}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        categories={categories}
        onUpdate={fetchData}
        onDelete={fetchData}
      />
    </div>
  )
}
