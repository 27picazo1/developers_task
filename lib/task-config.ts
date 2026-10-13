import { Bug, Lightbulb, Sparkles, ListTodo, Circle, Clock, CheckCircle2 } from 'lucide-react'
import type { TaskStatus, TaskType } from '@/lib/types'

export const typeConfig: Record<
  TaskType,
  { label: string; plural: string; icon: typeof Bug; className: string; accent: string }
> = {
  bug: {
    label: 'Bug',
    plural: 'Bugs',
    icon: Bug,
    className: 'border-red-500/30 bg-red-500/10 text-red-300',
    accent: 'bg-red-400',
  },
  idea: {
    label: 'Idea',
    plural: 'Ideas',
    icon: Lightbulb,
    className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    accent: 'bg-yellow-400',
  },
  improvement: {
    label: 'Mejora',
    plural: 'Mejoras',
    icon: Sparkles,
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    accent: 'bg-violet-400',
  },
  task: {
    label: 'Tarea',
    plural: 'Tareas',
    icon: ListTodo,
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    accent: 'bg-sky-400',
  },
}

export const typeOrder: TaskType[] = ['bug', 'idea', 'improvement', 'task']

export function getType(type: TaskType | null | undefined) {
  return typeConfig[type ?? 'task'] ?? typeConfig.task
}

export const columns: {
  status: TaskStatus
  label: string
  icon: typeof Circle
  dot: string
  text: string
  ring: string
}[] = [
  { status: 'pending', label: 'Pendiente', icon: Circle, dot: 'bg-blue-400', text: 'text-blue-400', ring: 'ring-blue-400/60' },
  { status: 'in_progress', label: 'En progreso', icon: Clock, dot: 'bg-amber-400', text: 'text-amber-400', ring: 'ring-amber-400/60' },
  { status: 'completed', label: 'Hecho', icon: CheckCircle2, dot: 'bg-emerald-400', text: 'text-emerald-400', ring: 'ring-emerald-400/60' },
]
