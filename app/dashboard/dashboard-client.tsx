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
  Filter,
  Tag,
  MoreHorizontal,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
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

  return (
    <div className="min-h-screen bg-background">
      <Header profile={profile} />
      
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <button
            onClick={() => setFilterStatus(filterStatus === 'pending' ? 'all' : 'pending')}
            className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
              filterStatus === 'pending' ? 'border-blue-500/50 bg-blue-500/10' : 'border-border/50 bg-card/50 hover:bg-card'
            }`}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <Circle className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold">{statusCounts.pending}</p>
              <p className="text-sm text-muted-foreground">Pendientes</p>
            </div>
          </button>
          <button
            onClick={() => setFilterStatus(filterStatus === 'in_progress' ? 'all' : 'in_progress')}
            className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
              filterStatus === 'in_progress' ? 'border-amber-500/50 bg-amber-500/10' : 'border-border/50 bg-card/50 hover:bg-card'
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
            className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
              filterStatus === 'completed' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-border/50 bg-card/50 hover:bg-card'
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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
