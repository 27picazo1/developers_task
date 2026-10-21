import { Loader2 } from 'lucide-react'

// Se muestra al instante al pulsar "Tareas": la navegación responde con un solo clic
// aunque el servidor tarde un momento en cargar los datos.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando tareas" />
    </div>
  )
}
