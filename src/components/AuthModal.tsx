import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { startDesktopGoogleLogin } from '../lib/desktopLogin'
import { isTauriDesktop } from '../lib/platform'
import { phoneAuthAvailable, signInWithPhoneNumber, setPhoneAccountEmail } from '../lib/phoneAuth'
import { getErrorMessage } from '../lib/errors'

type Props = {
  onClose: () => void
}

export function AuthModal({ onClose }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'detecting' | 'sending' | 'waiting' | 'needEmail'>('idle')
  const [emailDraft, setEmailDraft] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)

  async function handlePhone() {
    setError(null)
    try {
      const result = await signInWithPhoneNumber(setPhoneStatus)
      if (result.isNewAccount) {
        setPhoneStatus('needEmail')
      } else {
        onClose()
      }
    } catch (cause) {
      setError(getErrorMessage(cause))
      setPhoneStatus('idle')
    }
  }

  async function handleSetEmail() {
    setEmailError(null)
    setEmailBusy(true)
    try {
      await setPhoneAccountEmail(emailDraft.trim())
      onClose()
    } catch (cause) {
      const message = getErrorMessage(cause)
      setEmailError(message.includes('EMAIL_TAKEN') ? 'Esse e-mail já está em uso por outra conta.' : message.includes('EMAIL_INVALID') ? 'Digita um e-mail válido.' : 'Não consegui salvar o e-mail, tenta de novo.')
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    if (isTauriDesktop) {
      // Google bloqueia login OAuth dentro de uma webview embutida - abre no
      // navegador padrao do sistema. O retorno passa por uma pagina https (ja
      // liberada no Supabase, mesma origem do login web) que so entao tenta abrir
      // o app via deep link thoth://callback - navegar direto pra um protocolo
      // customizado a partir do navegador deixava a aba "pensando" pra sempre.
      const loginError = await startDesktopGoogleLogin()
      if (loginError) setError(loginError)
      return
    }
    const redirectTo = Capacitor.isNativePlatform()
      ? 'thoth://callback'
      : `${window.location.origin}${import.meta.env.BASE_URL}${window.location.search}`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
    if (oauthError) setError(oauthError.message)
  }

  if (phoneStatus === 'needEmail') {
    return (
      <div className="modal-backdrop">
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <h2>Quase lá</h2>
          <p>Sua conta foi criada com o número confirmado. Falta só o e-mail — usado pra te acharem pelo @ ou e-mail, sem notificação nenhuma por ele.</p>
          <input
            type="email"
            placeholder="seu@email.com"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            autoFocus
          />
          {emailError && <p className="auth-error">{emailError}</p>}
          <button type="button" className="google-btn" style={{ marginTop: 10 }} disabled={emailBusy || !emailDraft.trim()} onClick={handleSetEmail}>
            {emailBusy ? 'Salvando…' : 'Continuar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Entrar no Thoth Messenger</h2>
        <p>Você precisa de uma conta pra fazer isso.</p>
        <button type="button" className="google-btn" onClick={handleGoogle}>
          Entrar com Google
        </button>
        {phoneAuthAvailable() && (
          <button type="button" className="google-btn" style={{ marginTop: 8 }} disabled={phoneStatus !== 'idle'} onClick={handlePhone}>
            {phoneStatus === 'detecting' ? 'Detectando seu número…'
              : phoneStatus === 'sending' ? 'Mandando SMS…'
              : phoneStatus === 'waiting' ? 'Esperando confirmação…'
              : 'Continuar com número de celular'}
          </button>
        )}
        {error && <p className="auth-error">{error}</p>}
        <button type="button" className="modal-close" onClick={onClose}>fechar</button>
      </div>
    </div>
  )
}
