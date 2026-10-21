'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'

/** Miniatura con botón de play; al pulsar carga el reproductor dentro de la propia web. */
export function YouTubeEmbed({ id, start, title }: { id: string; start: number; title: string }) {
  const [playing, setPlaying] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-black shadow-sm">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1${start > 0 ? `&start=${start}` : ''}`}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="group absolute inset-0 block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Reproducir ${title}`}
        >
          {thumbFailed ? (
            <div className="absolute inset-0 bg-gradient-to-br from-red-600/40 via-zinc-900 to-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              onError={() => setThumbFailed(true)}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <span className="absolute left-1/2 top-1/2 flex h-14 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-red-600 shadow-lg transition-transform duration-200 group-hover:scale-110">
            <Play className="h-6 w-6 translate-x-0.5 fill-white text-white" />
          </span>
        </button>
      )}
    </div>
  )
}
