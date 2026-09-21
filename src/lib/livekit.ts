import { supabase } from './supabase'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Token do canal de voz. Tenta ate 3 vezes: erro de rede ("Failed to fetch"), 5xx e 401 (sessao velha - renova e tenta de novo)
// acontecem quando o Supabase esta instavel, e a 2a tentativa quase sempre passa.
export async function fetchLiveKitToken(channelId: string): Promise<{ token: string; url: string }> {
  let lastError: Error = new Error('falha ao gerar token do canal de voz')
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let accessToken = (await supabase.auth.getSession()).data.session?.access_token
      if (attempt > 0) {
        const refreshed = await supabase.auth.refreshSession()
        accessToken = refreshed.data.session?.access_token || accessToken
      }
      if (!accessToken) throw new Error('sem sessão')

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId }),
      })
      if (res.ok) return res.json()
      const body = await res.json().catch(() => ({}))
      lastError = new Error(body.error || body.message || `falha ao gerar token do canal de voz (${res.status})`)
      // 4xx de verdade (sem acesso ao canal etc.) nao adianta repetir; 401 e 5xx sim
      if (res.status < 500 && res.status !== 401) throw lastError
    } catch (err) {
      if (err instanceof TypeError) {
        lastError = new Error('Não consegui falar com o servidor de voz (rede ou instabilidade do Supabase). Tenta entrar de novo em instantes.')
      } else {
        throw err
      }
    }
    await wait(800 * (attempt + 1))
  }
  throw lastError
}
