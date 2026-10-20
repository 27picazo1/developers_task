'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bookmark, Code2, KeyRound, LogOut, ServerCog, User } from 'lucide-react'
import { CredentialsDialog } from '@/components/credentials-dialog'
import type { Profile } from '@/lib/types'

interface HeaderProps {
  profile: Profile | null
}

export function Header({ profile }: HeaderProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [isAdmin, setIsAdmin] = useState(false)
  const [credentialsOpen, setCredentialsOpen] = useState(false)

  // Solo el administrador ve la opción de generar credenciales.
  useEffect(() => {
    let active = true
    supabase.rpc('is_admin').then(({ data }) => {
      if (active) setIsAdmin(data === true)
    })
    return () => { active = false }
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const initials = profile?.display_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-400/10 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 shadow-[0_0_24px_rgba(52,211,153,0.12)]">
            <Code2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span className="block text-base font-semibold leading-none sm:text-lg">FiveM Dev Tasks</span>
            <span className="mt-1 hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <ServerCog className="h-3 w-3" />
              Build queue para scripts, bugs y releases
            </span>
          </div>
          <nav className="ml-4 hidden items-center gap-1 border-l border-border/60 pl-4 sm:flex" aria-label="Navegación principal">
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>Tareas</Button>
            <Button variant="ghost" size="sm" onClick={() => router.push('/resources')}>
              <Bookmark data-icon="inline-start" />Recursos
            </Button>
          </nav>
        </div>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center gap-2 p-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {profile?.display_name || 'Usuario'}
                  <span
                    className={`rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${
                      isAdmin
                        ? 'border-violet-500/30 bg-violet-500/10 text-violet-300'
                        : 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                    }`}
                  >
                    {isAdmin ? 'Admin' : 'Usuario'}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{profile?.email}</span>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <User className="mr-2 h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => setCredentialsOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" />
                Generar credenciales
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar Sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isAdmin && <CredentialsDialog open={credentialsOpen} onOpenChange={setCredentialsOpen} />}
    </header>
  )
}
