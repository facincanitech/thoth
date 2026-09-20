import { supabase } from './supabase'

const FALLBACK_REDIRECT = 'https://facincanitech.github.io/thothchat/desktop-login.html'

// Login Google do desktop: tenta o retorno por servidor local (sem pop-up do navegador
// e sem depender do protocolo thoth:// estar registrado); se o servidor local nao
// subir, cai na pagina https + deep link de antes.
export async function startDesktopGoogleLogin(): Promise<string | null> {
  let redirectTo = FALLBACK_REDIRECT
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const port = await invoke<number>('start_login_server')
    redirectTo = 'http://127.0.0.1:' + port + '/'
  } catch {
    // usa o fallback
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true },
  })
  if (error) return error.message
  if (data?.url) {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(data.url)
  }
  return null
}
