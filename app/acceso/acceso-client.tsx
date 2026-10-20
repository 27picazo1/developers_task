'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, KeyRound, Loader2, LogOut, ShieldAlert } from 'lucide-react'

interface AccesoClientProps {
  email: string
  expired: boolean
}

// Muestra el código como XXXX-XXXX-XXXX-XXXX mientras se escribe.
function formatCode(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}

export function AccesoClient({ email, expired }: AccesoClientProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.rpc('redeem_access_code', { p_code: code })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Introduce tus credenciales</CardTitle>
          <CardDescription>
            Tu cuenta está creada, pero para entrar necesitas la credencial que te ha dado el administrador.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleRedeem}>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {expired
                  ? 'Tu acceso temporal ha caducado. Pide una credencial nueva al administrador para volver a entrar.'
                  : 'Aún no tienes acceso a la plataforma. Introduce tus credenciales para continuar.'}
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="code">Credencial de acceso</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(formatCode(e.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                className="bg-background/50 text-center font-mono text-lg tracking-widest"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading || code.replace(/-/g, '').length < 16}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Acceder
            </Button>
            <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
              <span className="truncate">Sesión: {email}</span>
              <Button type="button" variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-1.5 h-4 w-4" />
                Cerrar sesión
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
