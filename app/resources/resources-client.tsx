'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Resource, ResourceType } from '@/lib/types'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Bookmark, Download, ExternalLink, Link2, Plus, Search, Trash2 } from 'lucide-react'

const typeLabels: Record<ResourceType, string> = { script: 'Script', mlo: 'MLO', vehicle: 'Vehículo', map: 'Mapa', ui: 'UI', tool: 'Herramienta', other: 'Otro' }
const typeColors: Record<ResourceType, string> = { script: 'bg-primary/10 text-primary', mlo: 'bg-violet-500/10 text-violet-300', vehicle: 'bg-amber-500/10 text-amber-300', map: 'bg-sky-500/10 text-sky-300', ui: 'bg-pink-500/10 text-pink-300', tool: 'bg-orange-500/10 text-orange-300', other: 'bg-muted text-muted-foreground' }

export function ResourcesClient({ profile, initialResources }: { profile: Profile | null; initialResources: Resource[] }) {
  const supabase = createClient()
  const [resources, setResources] = useState(initialResources)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | ResourceType>('all')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', resource_type: 'script' as ResourceType, url: '', download_url: '', tags: '', notes: '' })

  const filtered = useMemo(() => resources.filter((item) => {
    const haystack = `${item.title} ${item.description ?? ''} ${item.tags.join(' ')}`.toLowerCase()
    return (type === 'all' || item.resource_type === type) && haystack.includes(query.toLowerCase())
  }), [resources, query, type])

  const saveResource = async () => {
    if (!form.title.trim()) return toast.error('Añade un título')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return toast.error('Sesión no disponible')
    const payload = { user_id: user.id, title: form.title.trim(), description: form.description || null, resource_type: form.resource_type, url: form.url || null, download_url: form.download_url || null, tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean), notes: form.notes || null }
    const { data, error } = await supabase.from('resources').insert(payload).select().single()
    if (error) return toast.error('No se pudo guardar el recurso')
    setResources((current) => [data as Resource, ...current])
    setForm({ title: '', description: '', resource_type: 'script', url: '', download_url: '', tags: '', notes: '' })
    setOpen(false)
    toast.success('Recurso guardado')
  }

  const removeResource = async (id: string) => {
    const { error } = await supabase.from('resources').delete().eq('id', id)
    if (error) return toast.error('No se pudo eliminar')
    setResources((current) => current.filter((item) => item.id !== id))
    toast.success('Recurso eliminado')
  }

  return <div className="min-h-screen bg-background"><Header profile={profile} /><main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-2 flex items-center gap-2 text-primary"><Bookmark className="size-4" /><span className="text-sm font-medium uppercase tracking-wider">Biblioteca privada</span></div><h1 className="text-3xl font-bold tracking-tight">Recursos FiveM</h1><p className="mt-2 text-muted-foreground">Guarda referencias, enlaces y descargas de tus recursos autorizados.</p></div><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus data-icon="inline-start" />Añadir recurso</Button></DialogTrigger><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Nuevo recurso</DialogTitle></DialogHeader><div className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="resource-title">Título</Label><Input id="resource-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Inventario avanzado" /></div><div className="grid grid-cols-2 gap-4"><div className="flex flex-col gap-2"><Label>Tipo</Label><Select value={form.resource_type} onValueChange={(value) => setForm({ ...form, resource_type: value as ResourceType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="flex flex-col gap-2"><Label>Etiquetas</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="qbcore, ui" /></div></div><div className="flex flex-col gap-2"><Label htmlFor="resource-description">Descripción</Label><Textarea id="resource-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Qué contiene y para qué sirve..." /></div><div className="flex flex-col gap-2"><Label htmlFor="resource-url">Enlace de referencia</Label><Input id="resource-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></div><div className="flex flex-col gap-2"><Label htmlFor="resource-download">Enlace de descarga</Label><Input id="resource-download" type="url" value={form.download_url} onChange={(e) => setForm({ ...form, download_url: e.target.value })} placeholder="https://..." /></div><div className="flex flex-col gap-2"><Label htmlFor="resource-notes">Notas privadas</Label><Textarea id="resource-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Dependencias, versión, instalación..." /></div></div><DialogFooter><Button onClick={saveResource}>Guardar recurso</Button></DialogFooter></DialogContent></Dialog></div>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar recursos, etiquetas..." /></div><Select value={type} onValueChange={(value) => setType(value as typeof type)}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los tipos</SelectItem>{Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => <Card key={item.id} className="group border-border/60 bg-card/70"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><Badge className={typeColors[item.resource_type]}>{typeLabels[item.resource_type]}</Badge><CardTitle className="mt-3 text-lg">{item.title}</CardTitle></div><Button variant="ghost" size="icon" onClick={() => removeResource(item.id)} aria-label={`Eliminar ${item.title}`}><Trash2 className="size-4 text-muted-foreground" /></Button></div><CardDescription className="line-clamp-2">{item.description || 'Sin descripción'}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4"><div className="flex flex-wrap gap-1.5">{item.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>)}</div><div className="flex items-center gap-2 border-t border-border/60 pt-3">{item.url && <Button asChild variant="outline" size="sm"><a href={item.url} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Referencia</a></Button>}{item.download_url && <Button asChild size="sm"><a href={item.download_url} target="_blank" rel="noreferrer"><Download data-icon="inline-start" />Descarga</a></Button>}{!item.url && !item.download_url && <span className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="size-3.5" />Sin enlaces</span>}</div></CardContent></Card>)}</div> : <div className="rounded-xl border border-dashed border-border p-12 text-center"><Bookmark className="mx-auto mb-3 size-8 text-muted-foreground" /><h2 className="font-semibold">Tu biblioteca está vacía</h2><p className="mt-1 text-sm text-muted-foreground">Añade enlaces, notas y referencias de recursos con licencia o autorización.</p></div>}
  </main></div>
}
