'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from 'lucide-react'

export interface LightboxImage {
  id: string
  name: string
  src: string
}

export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[]
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const image = index !== null ? images[index] : null
  const hasMany = images.length > 1

  const go = (delta: number) => {
    if (index === null) return
    onIndexChange((index + delta + images.length) % images.length)
  }

  return (
    <Dialog open={index !== null && !!image} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden border-white/10 bg-black/95 p-0 sm:max-w-[min(96vw,1100px)]"
        onKeyDown={(e) => {
          if (!hasMany) return
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
          if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
        }}
      >
        <DialogTitle className="sr-only">{image?.name ?? 'Imagen'}</DialogTitle>
        <DialogDescription className="sr-only">Vista ampliada de la imagen adjunta</DialogDescription>
        {image && (
          <>
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-white">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{image.name}</p>
              {hasMany && (
                <span className="text-xs text-white/60">{(index ?? 0) + 1} / {images.length}</span>
              )}
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white">
                <a href={image.src} target="_blank" rel="noopener noreferrer" title="Abrir original">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white">
                <a href={image.src} download={image.name} title="Descargar">
                  <Download className="h-4 w-4" />
                </a>
              </Button>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hover:text-white" title="Cerrar">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
            <div className="relative flex min-h-[40vh] items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={image.id}
                src={image.src}
                alt={image.name}
                className="max-h-[78vh] max-w-full rounded-md object-contain"
              />
              {hasMany && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute left-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20"
                    onClick={() => go(-1)}
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-3 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/10 text-white hover:bg-white/20"
                    onClick={() => go(1)}
                    aria-label="Imagen siguiente"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
