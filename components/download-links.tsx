'use client'

import { ChevronDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { linkLabel, parseDownloadLinks } from '@/lib/download-links'

/**
 * Botón(es) de descarga de un recurso.
 *  · Un enlace: el botón "Descarga" de siempre.
 *  · Varios, `inline` (tarjetas): un botón "Descargas (n)" con un menú para elegir enlace.
 *  · Varios, `stack` (detalle): un botón por enlace, uno debajo de otro.
 */
export function DownloadLinks({
  value,
  layout = 'inline',
  className,
}: {
  value: string | null | undefined
  layout?: 'inline' | 'stack'
  className?: string
}) {
  const links = parseDownloadLinks(value)
  if (links.length === 0) return null

  if (layout === 'stack') {
    return (
      <>
        {links.map((url, index) => (
          <Button key={url} asChild variant={index === 0 ? 'default' : 'secondary'} className={cn('justify-start', className)}>
            <a href={url} target="_blank" rel="noreferrer">
              <Download data-icon="inline-start" />
              {links.length === 1 ? 'Descarga' : `Descarga ${index + 1} · ${linkLabel(url)}`}
            </a>
          </Button>
        ))}
      </>
    )
  }

  if (links.length === 1) {
    return (
      <Button asChild size="sm" className={className}>
        <a href={links[0]} target="_blank" rel="noreferrer">
          <Download data-icon="inline-start" />
          Descarga
        </a>
      </Button>
    )
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className={className}>
          <Download data-icon="inline-start" />
          Descargas ({links.length})
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {links.map((url, index) => (
          <DropdownMenuItem key={url} asChild>
            <a href={url} target="_blank" rel="noreferrer" className="cursor-pointer gap-2">
              <span className="shrink-0 font-medium">Enlace {index + 1}</span>
              <span className="truncate text-muted-foreground">{linkLabel(url)}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
