import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { isTauriDesktop } from '../lib/platform'

type Props = {
  onClose: () => void
}

export function AuthModal({ onClose }: Props) {
  const [error, setError] = useState<string | null>(null)

  async function handleGoogle() {
    setError(null)
    if (isTauriDesktop) {
      // Google bloqueia login OAuth dentro de uma webview embutida - abre no
      // navegador padrao do sistema. O retorno passa por uma pagina https (ja
      // liberada no Supabase, mesma origem do login web) que so entao tenta abrir
      // o app via deep link ferus://callback - navegar direto pra um protocolo
      // customizado a partir do navegador deixava a aba "pensando" pra sempre.
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://facincanitech.github.io/thothchat/desktop-login.html', queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true },
      })
      if (oauthError) { setError(oauthError.message); return }
      if (data?.url) {
        const { open } = await import('@tauri-apps/plugin-shell')
        await open(data.url)
      }
      return
    }
    const redirectTo = Capacitor.isNativePlatform()
      ? 'ferus://callback'
      : `${window.location.origin}${import.meta.env.BASE_URL}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
    if (oauthError) setError(oauthError.message)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Entrar no ThothChat</h2>
        <p>Você precisa de uma conta pra fazer isso.</p>
        <button type="button" className="google-btn" onClick={handleGoogle}>
          Entrar com Google
        </button>
        {error && <p className="auth-error">{error}</p>}
        <button type="button" className="modal-close" onClick={onClose}>fechar</button>
      </div>
    </div>
  )
}
