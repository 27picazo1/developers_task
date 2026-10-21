import type { Category, Profile, ResourceStatus, ResourceType, TaskStatus, TaskType } from '@/lib/types'

export interface TaskForResource {
  title: string
  description: string | null
  status: TaskStatus
  type?: TaskType | null
  created_at: string
  user_id: string
  subtasks: { title: string; completed: boolean }[]
  comments: { user_id: string; content: string; created_at: string }[]
}

export interface ResourceDraft {
  title: string
  description: string
  resource_type: ResourceType
  status: ResourceStatus
  url: string
  download_url: string
  tags: string
  notes: string
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Adivina el tipo de recurso a partir del texto de la tarea. Siempre se puede cambiar en la vista previa. */
export function suggestResourceType(text: string): ResourceType {
  const t = normalize(text)
  if (/\bmlo\b|\binterior(es)?\b/.test(t)) return 'mlo'
  if (/\bvehiculos?\b|\bcoches?\b|\bcars?\b|\bmotos?\b|\bvehicles?\b/.test(t)) return 'vehicle'
  if (/\bmapas?\b|\bmaps?\b|\bymap\b|\bmapping\b/.test(t)) return 'map'
  if (/\bui\b|\bnui\b|\bhud\b|\binterfaz\b/.test(t)) return 'ui'
  if (/\bscripts?\b|\besx\b|\bqbcore\b|\bqb-core\b|\blua\b/.test(t)) return 'script'
  if (/\bherramientas?\b|\btools?\b/.test(t)) return 'tool'
  return 'other'
}

export function mapStatus(status: TaskStatus): ResourceStatus {
  if (status === 'completed') return 'implemented'
  if (status === 'in_progress') return 'in_progress'
  return 'pending'
}

const isYouTubeHost = (url: string) => /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(url)

/** Enlaces http(s) de un texto, sin duplicados y sin la puntuación final. */
export function extractLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) ?? []
  const clean = found.map((link) => link.replace(/[.,;:!?)\]}]+$/, ''))
  return [...new Set(clean)]
}

const DOWNLOAD_HINT = /(download|descarg|drive\.google\.com|mega\.nz|mediafire|dropbox\.com|github\.com\/[^/]+\/[^/]+\/releases)/i

const slugTag = (text: string) =>
  normalize(text).replace(/[,#]/g, ' ').trim().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '').slice(0, 30)

const TYPE_TAG: Partial<Record<TaskType, string>> = { bug: 'bug', idea: 'idea', improvement: 'mejora' }

const nameOf = (profile?: Profile | null) => profile?.display_name || profile?.email?.split('@')[0] || 'Usuario'

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Propuesta inicial del recurso a partir de una tarea. */
export function buildResourceDraft(task: TaskForResource, category: Category | null | undefined, profiles: Profile[]): ResourceDraft {
  const description = (task.description ?? '').trim()
  const links = extractLinks(description).filter((link) => !isYouTubeHost(link))
  const downloadLink = links.find((link) => DOWNLOAD_HINT.test(link)) ?? ''
  const referenceLink = links.find((link) => link !== downloadLink) ?? ''

  // Si la descripción es solo un enlace, ya queda en «Enlace de referencia»: no se repite.
  const onlyLink = links.length === 1 && description === links[0]
  const finalDescription = onlyLink ? '' : description

  const tags = [...new Set([category ? slugTag(category.name) : '', TYPE_TAG[task.type ?? 'task'] ?? ''].filter(Boolean))]

  const author = profiles.find((p) => p.id === task.user_id)
  const sections: string[] = [`Movido desde Tareas (creada por ${nameOf(author)} el ${formatDate(task.created_at)}).`]

  if (task.subtasks.length) {
    sections.push(`Subtareas:\n${task.subtasks.map((s) => `- [${s.completed ? 'x' : ' '}] ${s.title}`).join('\n')}`)
  }
  if (task.comments.length) {
    const ordered = [...task.comments].sort((a, b) => a.created_at.localeCompare(b.created_at))
    sections.push(
      `Comentarios:\n${ordered
        .map((c) => `- ${nameOf(profiles.find((p) => p.id === c.user_id))} (${formatDate(c.created_at)}): ${c.content.replace(/\s*\n\s*/g, ' ')}`)
        .join('\n')}`,
    )
  }

  return {
    title: task.title,
    description: finalDescription,
    resource_type: suggestResourceType(`${task.title} ${description} ${category?.name ?? ''}`),
    status: mapStatus(task.status),
    url: referenceLink,
    download_url: downloadLink,
    tags: tags.join(', '),
    notes: sections.join('\n\n'),
  }
}

/** Los recursos solo reconocen estas imágenes; el resto de tipos de imagen se guardan como PNG (solo es una etiqueta, el navegador las muestra igual). */
export function resourceImageType(fileType: string): string {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(fileType) ? fileType : 'image/png'
}
