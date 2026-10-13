'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Category, TaskWithRelations, TaskStatus, TaskType } from '@/lib/types'
import { Header } from '@/components/header'
import { TaskCard, authorName } from '@/components/task-card'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Tag, MoreHorizontal, Pencil, Trash2, Loader2, Users, X } from 'lucide-react'
import { columns, typeConfig, typeOrder } from '@/lib/task-config'

interface DashboardClientProps {
  profile: Profile | null
  initialCategories: Category[]
  initialTasks: TaskWithRelations[]
  initialProfiles: Profile[]
}

type FilterType = 'all' | TaskType

export function DashboardClient({ profile, initialCategories, initialTasks, initialProfiles }: DashboardClientProps) {
  const [categories, setCategories] = useState(initialCategories)
  const [tasks, setTasks] = useState(initialTasks)
  const [profiles, setProfiles] = useState(initialProfiles)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterAuthor, setFilterAuthor] = useState<string>('all')

  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [newTaskType, setNewTaskType] = useState<TaskType>('task')
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('pending')
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null)
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<TaskStatus | null>(null)

  const [loading, setLoading] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // Workspace compartido: sin filtrar por user_id. Quién puede ver qué lo decide RLS en Supabase.
      const [categoriesRes, tasksRes, profilesRes] = await Promise.all([
        supabase.from('categories').select('*').order('created_at', { ascending: true }),
        supabase
          .from('tasks')
          .select(`
            *,
            category:categories(*),
            subtasks(*),
            comments(*),
            attachments(*)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ])

      if (categoriesRes.data) setCategories(categoriesRes.data)
      if (profilesRes.data) setProfiles(profilesRes.data)
      if (tasksRes.data) {
        const fresh = tasksRes.data as TaskWithRelations[]
        setTasks(fresh)
        setSelectedTask((current) => (current ? fresh.find((t) => t.id === current.id) ?? current : current))
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  // Refresco automático para ver lo que crean los demás sin recargar la página
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData()
    }, 20000)
    return () => clearInterval(interval)
  }, [fetchData])

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])

  const handleDeleteCategory = async (category: Category) => {
    await supabase.from('categories').delete().eq('id', category.id)
    if (filterCategory === category.id) setFilterCategory(null)
    fetchData()
  }

  const handleTaskClick = (task: TaskWithRelations) => {
    setSelectedTask(task)
    setTaskDetailOpen(true)
  }

  const openNewTask = (type: TaskType, status: TaskStatus = 'pending') => {
    setNewTaskType(type)
    setNewTaskStatus(status)
    setTaskDialogOpen(true)
  }

  // Mover una tarjeta entre columnas (arrastrar y soltar)
  const moveTask = async (taskId: string, status: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === status) return
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
    const { error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    if (error) {
      console.error('Error moving task:', error)
      fetchData()
    }
  }

  // Filtros
  const searchLower = search.toLowerCase()
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      !searchLower ||
      task.title.toLowerCase().includes(searchLower) ||
      task.description?.toLowerCase().includes(searchLower)
    const matchesType = filterType === 'all' || (task.type ?? 'task') === filterType
    const matchesCategory = !filterCategory || task.category_id === filterCategory
    const matchesAuthor = filterAuthor === 'all' || task.user_id === filterAuthor
    return matchesSearch && matchesType && matchesCategory && matchesAuthor
  })

  const typeCounts = typeOrder.reduce(
    (acc, t) => ({ ...acc, [t]: tasks.filter((task) => (task.type ?? 'task') === t && task.status !== 'completed').length }),
    {} as Record<TaskType, number>
  )

  const authors = profiles.filter((p) => tasks.some((t) => t.user_id === p.id))
  const hasActiveFilters = filterType !== 'all' || filterCategory !== null || filterAuthor !== 'all' || search !== ''

  const clearFilters = () => {
    setFilterType('all')
    setFilterCategory(null)
    setFilterAuthor('all')
    setSearch('')
  }

  return (
    <div className="min-h-screen bg-background">
      <Header profile={profile} />

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Título + acciones rápidas */}
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Tablero del equipo</h1>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                <Users className="mr-1 h-3 w-3" />
                {profiles.length} {profiles.length === 1 ? 'miembro' : 'miembros'}
              </Badge>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <p className="text-sm text-muted-foreground">
              Todos ven las mismas tareas. Arrastra las tarjetas entre columnas para cambiar su estado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {typeOrder.map((t) => {
              const cfg = typeConfig[t]
              const Icon = cfg.icon
              return (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  className={`${cfg.className} hover:brightness-125`}
                  onClick={() => openNewTask(t)}
                >
                  <Icon className="mr-1.5 h-4 w-4" />
                  Nuevo {cfg.label.toLowerCase()}
                </Button>
              )
            })}
          </div>
        </div>

        {/* Contadores por tipo (clicables = filtro) */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {typeOrder.map((t) => {
            const cfg = typeConfig[t]
            const Icon = cfg.icon
            const active = filterType === t
            return (
              <button
                key={t}
                onClick={() => setFilterType(active ? 'all' : t)}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all hover:-translate-y-0.5 ${
                  active ? `${cfg.className} ring-1 ring-current` : 'border-border/60 bg-card/45 hover:bg-card/70'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${cfg.className}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{typeCounts[t]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{cfg.plural} abiert{t === 'idea' || t === 'improvement' ? 'as' : 'os'}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Barra de filtros */}
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border/60 bg-card/35 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterAuthor} onValueChange={setFilterAuthor}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Todos los miembros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los miembros</SelectItem>
                {authors.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {authorName(p)}
                    {p.id === profile?.id ? ' (tú)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
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
        </div>

        {/* Filtro por categorías */}
        {categories.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Categorías:</span>
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

        {/* Tablero Kanban */}
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.status)
            const ColIcon = col.icon
            const isOver = overColumn === col.status && draggingId !== null
            return (
              <section
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (overColumn !== col.status) setOverColumn(col.status)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain') || draggingId
                  setOverColumn(null)
                  setDraggingId(null)
                  if (id) moveTask(id, col.status)
                }}
                className={`flex min-h-[320px] flex-col rounded-xl border bg-card/25 p-3 transition-all ${
                  isOver ? `border-transparent ring-2 ${col.ring} bg-card/50` : 'border-border/60'
                }`}
              >
                <header className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                    <ColIcon className={`h-4 w-4 ${col.text}`} />
                    <h2 className="text-sm font-semibold">{col.label}</h2>
                    <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground">
                      {colTasks.length}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openNewTask(filterType === 'all' ? 'task' : filterType, col.status)}
                    title={`Añadir en ${col.label}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </header>

                <div className="flex flex-1 flex-col gap-3">
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      author={profileById.get(task.user_id)}
                      onClick={() => handleTaskClick(task)}
                      draggable
                      dragging={draggingId === task.id}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', task.id)
                        e.dataTransfer.effectAllowed = 'move'
                        setDraggingId(task.id)
                      }}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setOverColumn(null)
                      }}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-10 text-center text-xs text-muted-foreground">
                      {tasks.length === 0 ? 'Aún no hay nada. ¡Crea el primer bug o idea!' : 'Nada por aquí'}
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </main>

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        categories={categories}
        onSuccess={fetchData}
        defaultType={newTaskType}
        defaultStatus={newTaskStatus}
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
        profiles={profiles}
        onUpdate={fetchData}
        onDelete={fetchData}
      />
    </div>
  )
}
