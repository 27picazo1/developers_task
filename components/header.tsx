'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bell, ChevronDown, Code2, Folder, KeyRound, List, LogOut, Plus, User, Users } from 'lucide-react'
import { CredentialsDialog } from '@/components/credentials-dialog'
import { QuickResourceDialog } from '@/components/quick-resource-dialog'
import type { Profile } from '@/lib/types'
import { can, roleBadgeClasses, roleLabels, type Role } from '@/lib/roles'
import { cn } from '@/lib/utils'

interface HeaderProps {
  profile: Profile | null
  /** Rango del usuario, calculado en el servidor (evita parpadeos y clics perdidos). */
  role: Role
}

export function Header({ profile, role }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])
  const isAdmin = can.manageMembers(role)
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [dialogTab, setDialogTab] = useState<'credenciales' | 'personas'>('credenciales')
  const canQuickAdd = can.editResources(role)
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickText, setQuickText] = useState('')

  // Marcador del navegador: <web>/resources?add=<enlace y título> abre el guardado rápido ya rellenado.
  useEffect(() => {
    if (!canQuickAdd) return
    const params = new URLSearchParams(window.location.search)
    const add = params.get('add')
    if (!add) return
    params.delete('add')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
    setQuickText(add)
    setQuickOpen(true)
  }, [canQuickAdd])

  const openDialog = (tab: 'credenciales' | 'personas') => {
    setDialogTab(tab)
    setCredentialsOpen(true)
  }

  // <Link> precarga la página y navega con un solo clic.
  const navClass = (href: string) =>
    cn(
      'h-9 gap-2.5 border border-transparent px-4 text-muted-foreground hover:text-foreground',
      pathname.startsWith(href) &&
        'border-primary/50 bg-primary/10 text-primary shadow-[0_0_14px_rgba(52,211,153,0.18)] hover:bg-primary/15 hover:text-primary',
    )

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const shortName = profile?.display_name || profile?.email?.split('@')[0] || 'Usuario'

  const initials = profile?.display_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U'

  return (
    <header className="sticky top-0 z-50 border-b border-primary/15 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-[46px]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/50 bg-primary/10 shadow-[0_0_18px_rgba(52,211,153,0.25)]">
            <Code2 className="h-5 w-5 text-primary" />
          </div>
          <span className="ml-1 text-lg font-bold tracking-tight sm:text-xl">
            FiveM <span className="text-primary">Dev Tasks</span>
          </span>
          <nav className="ml-4 hidden items-center gap-2 border-l border-border/60 pl-8 sm:flex" aria-label="Navegación principal">
            <Button asChild variant="ghost" size="sm" className={navClass('/dashboard')}>
              <Link href="/dashboard" prefetch aria-current={pathname.startsWith('/dashboard') ? 'page' : undefined}>
                <List className="h-4 w-4" />Tareas
              </Link>
            </Button>
            {can.viewResources(role) && (
              <Button asChild variant="ghost" size="sm" className={navClass('/resources')}>
                <Link href="/resources" prefetch aria-current={pathname.startsWith('/resources') ? 'page' : undefined}>
                  <Folder className="h-4 w-4" />Recursos
                </Link>
              </Button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          {canQuickAdd && (
            <Button
              size="sm"
              className="mr-2 h-9 gap-1.5 px-3 font-semibold"
              onClick={() => {
                setQuickText('')
                setQuickOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Recurso</span>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="text-foreground/80" aria-label="Notificaciones">
            <Bell className="h-[18px] w-[18px]" />
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 rounded-full px-2">
                <Avatar className="h-7 w-7 border-[1.5px] border-primary">
                  <AvatarFallback className="bg-primary/15 text-[11px] font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-28 truncate text-sm sm:inline">{shortName}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
                      className={`rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${roleBadgeClasses[role]}`}
                    >
                      {roleLabels[role]}
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
                <DropdownMenuItem onClick={() => openDialog('personas')}>
                  <Users className="mr-2 h-4 w-4" />
                  Miembros y rangos
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem onClick={() => openDialog('credenciales')}>
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
      </div>
      {isAdmin && <CredentialsDialog open={credentialsOpen} onOpenChange={setCredentialsOpen} initialTab={dialogTab} />}
      {canQuickAdd && <QuickResourceDialog open={quickOpen} onOpenChange={setQuickOpen} initialText={quickText} />}
    </header>
  )
}
