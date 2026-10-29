'use client'

import { useState } from 'react'
import type { Resource, ResourceAttachment } from '@/lib/types'
import { ALLOWED_IMAGE_TYPES, statusColors, statusLabels, typeColors, typeLabels } from '@/lib/resource-config'
import { PriorityBadge } from '@/components/priority-badge'
import { DownloadLinks } from '@/components/download-links'
import { VIDEO_TYPE, parseYouTube } from '@/lib/youtube'
import { YouTubeEmbed } from '@/components/youtube-embed'
import { ResourceComments } from '@/components/resource-comments'
import { ImageLightbox, type LightboxImage } from '@/components/image-lightbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  Maximize2,
  Pencil,
  StickyNote,
  Video,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export type ResourceWithAttachments = Resource & { resource_attachments?: ResourceAttachment[] }

interface ResourceDetailDialogProps {
  resource: ResourceWithAttachments | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (resource: ResourceWithAttachments) => void
  /** Admin: descargas, referencias y edición. Moderador: solo lectura. */
  canDownload?: boolean
  canEdit?: boolean
}

const mediaUrl = (path: string) => (path.startsWith('r2/') ? `/api/file?pathname=${encodeURIComponent(path)}` : path)
const formatDate = (date: string) => format(new Date(date), "d MMM yyyy, HH:mm", { locale: es })

function formatSize(bytes: number) {
  if (!bytes) return 'Enlace'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Convierte las URLs de un texto en enlaces pulsables. */
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-sky-400 underline-offset-2 hover:underline">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function SectionTitle({ icon: Icon, children, count }: { icon: typeof Video; children: React.ReactNode; count?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground/80">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-base font-semibold tracking-tight">{children}</h3>
      {!!count && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{count}</span>}
    </div>
  )
}

export function ResourceDetailDialog({ resource, open, onOpenChange, onEdit, canDownload = true, canEdit = true }: ResourceDetailDialogProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set())

  if (!resource) return null

  const attachments = (resource.resource_attachments ?? []).slice().sort((a, b) => a.position - b.position)
  const images = attachments.filter((a) => ALLOWED_IMAGE_TYPES.includes(a.file_type))
  const banner = images.find((a) => a.is_banner) ?? images[0]
  // La portada va la primera, también en el visor.
  const gallery = banner ? [banner, ...images.filter((a) => a.id !== banner.id)] : images
  const videos = attachments.filter((a) => a.file_type === VIDEO_TYPE)
  const files = attachments.filter((a) => !ALLOWED_IMAGE_TYPES.includes(a.file_type) && a.file_type !== VIDEO_TYPE)
  const lightboxImages: LightboxImage[] = gallery.map((a) => ({ id: a.id, name: a.file_name, src: mediaUrl(a.file_path) }))
  const showBanner = banner && !brokenImages.has(banner.id)
  const markBroken = (id: string) => setBrokenImages((prev) => new Set(prev).add(id))

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setLightboxIndex(null)
          onOpenChange(next)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[94vh] max-h-[920px] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        >
          <DialogDescription className="sr-only">Detalle del recurso: descripción, vídeos, imágenes, archivos y notas</DialogDescription>

          {/* Portada */}
          <div className="relative isolate shrink-0 overflow-hidden border-b border-border/60">
            {showBanner ? (
              <button
                type="button"
                onClick={() => setLightboxIndex(0)}
                className="group absolute inset-0 -z-20 block h-full w-full cursor-zoom-in"
                aria-label="Ampliar la portada"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(banner.file_path)}
                  alt={`Portada: ${resource.title}`}
                  onError={() => markBroken(banner.id)}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </button>
            ) : (
              <div className="absolute inset-0 -z-20 bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
            )}
            <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/80 to-background/10" />

            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full bg-background/70 backdrop-blur hover:bg-background"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>

            <div className="pointer-events-none space-y-3 px-6 pb-5 pr-16 pt-28 sm:pt-40">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${typeColors[resource.resource_type]} backdrop-blur`}>{typeLabels[resource.resource_type]}</Badge>
                <Badge className={`${statusColors[resource.status ?? 'pending']} backdrop-blur`}>{statusLabels[resource.status ?? 'pending']}</Badge>
                <PriorityBadge priority={resource.priority} className="backdrop-blur" />
              </div>
              <DialogTitle className="text-2xl font-bold leading-tight tracking-tight text-pretty sm:text-3xl">{resource.title}</DialogTitle>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            {/* Contenido */}
            <div className="min-w-0 flex-1 space-y-8 p-6 lg:overflow-y-auto">
              <section className="space-y-3">
                <SectionTitle icon={FileText}>Descripción</SectionTitle>
                {resource.description ? (
                  <p className="whitespace-pre-wrap break-words rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm leading-relaxed text-foreground/85">
                    {canDownload ? <Linkified text={resource.description} /> : resource.description}
                  </p>
                ) : (
                  <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">Sin descripción.</p>
                )}
              </section>

              {videos.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle icon={Video} count={videos.length}>Vídeos</SectionTitle>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {videos.map((video) => {
                      const yt = parseYouTube(video.file_path)
                      return (
                        <div key={video.id} className="space-y-2">
                          {yt ? (
                            <YouTubeEmbed key={yt.id} id={yt.id} start={yt.start} title={video.file_name} />
                          ) : (
                            <a href={video.file_path} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                              <ExternalLink className="h-4 w-4" />
                              {video.file_name}
                            </a>
                          )}
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-medium" title={video.file_name}>{video.file_name}</p>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" asChild>
                              <a href={video.file_path} target="_blank" rel="noopener noreferrer" aria-label="Abrir en YouTube" title="Abrir en YouTube">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {gallery.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle icon={ImageIcon} count={gallery.length}>Imágenes</SectionTitle>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {gallery.map((image, i) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        className="group relative aspect-video cursor-zoom-in overflow-hidden rounded-xl border border-border/50 bg-muted shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Ampliar ${image.file_name}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={mediaUrl(image.file_path)}
                          alt={image.file_name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                          <Maximize2 className="h-5 w-5 text-white" />
                        </span>
                        {i === 0 && banner && (
                          <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">Portada</span>
                        )}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {files.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle icon={FileText} count={files.length}>Archivos</SectionTitle>
                  <div className="grid gap-2">
                    {files.map((file) => {
                      const rowClass = 'group flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-3 transition-colors hover:border-border hover:bg-card/70'
                      const inner = (
                        <>
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-sky-500/10 ring-1 ring-violet-500/30">
                            <FileText className="h-5 w-5 text-violet-200" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{file.file_name}</span>
                            <span className="block text-xs text-muted-foreground">{formatSize(file.file_size)}</span>
                          </span>
                          {canDownload && <Download className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />}
                        </>
                      )
                      // Sin permiso de descarga (moderador): solo nombre y tamaño, nada pulsable.
                      return canDownload && file.file_path ? (
                        <a key={file.id} href={mediaUrl(file.file_path)} target="_blank" rel="noreferrer" className={rowClass}>
                          {inner}
                        </a>
                      ) : (
                        <div key={file.id} className={rowClass}>
                          {inner}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <ResourceComments resourceId={resource.id} />
            </div>

            {/* Barra lateral */}
            <aside className="shrink-0 space-y-5 border-t border-border/60 bg-muted/20 p-5 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
              {canDownload && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Enlaces</p>
                {resource.url || resource.download_url ? (
                  <div className="flex flex-col gap-2">
                    {resource.url && (
                      <Button asChild variant="outline" className="justify-start">
                        <a href={resource.url} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />Referencia</a>
                      </Button>
                    )}
                    <DownloadLinks value={resource.download_url} layout="stack" />
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Link2 className="size-4" />Sin enlaces</p>
                )}
              </div>
              )}

              {resource.tags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Etiquetas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resource.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">#{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {canDownload && resource.notes && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <StickyNote className="h-3.5 w-3.5" />
                    Notas privadas
                  </p>
                  <p className="whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground">
                    <Linkified text={resource.notes} />
                  </p>
                </div>
              )}

              <dl className="space-y-3 rounded-xl border border-border/60 bg-background/50 p-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />Creado</dt>
                  <dd className="font-medium">{formatDate(resource.created_at)}</dd>
                </div>
                {resource.updated_at && resource.updated_at !== resource.created_at && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Actualizado</dt>
                    <dd className="font-medium">{formatDate(resource.updated_at)}</dd>
                  </div>
                )}
              </dl>

              {canEdit && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  onOpenChange(false)
                  onEdit(resource)
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar recurso
              </Button>
              )}
            </aside>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        allowDownload={canDownload}
      />
    </>
  )
}
