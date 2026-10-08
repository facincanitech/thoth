import { supabase } from './supabase'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const TOKEN_CACHE_MS = 45_000
const tokenCache = new Map<string, { expiresAt: number; promise: Promise<{ token: string; url: string }> }>()
let refreshPromise: ReturnType<typeof supabase.auth.refreshSession> | null = null

async function getAccessToken(forceRefresh = false) {
  const session = (await supabase.auth.getSession()).data.session
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 < Date.now() + 60_000
  if (!forceRefresh && session?.access_token && !expiresSoon) return session.access_token
  // Varios canais eram aquecidos ao mesmo tempo e todos tentavam consumir o mesmo refresh token.
  // Uma unica renovacao compartilhada evita invalidar a sessao por corrida entre requests.
  refreshPromise ||= supabase.auth.refreshSession().finally(() => { refreshPromise = null })
  const refreshed = await refreshPromise
  // Nunca reutiliza o access token que o servidor acabou de rejeitar. Antes, quando o refresh
  // token estava expirado/revogado, refreshSession devolvia erro e este fallback mandava o MESMO
  // JWT invalido outras duas vezes, terminando sempre em "invalid token".
  if (refreshed.error || !refreshed.data.session?.access_token) {
    throw new Error('Sua sessao expirou. Entre novamente para conectar na chamada.')
  }
  return refreshed.data.session.access_token
}

// Token do canal de voz. Tenta ate 3 vezes: erro de rede ("Failed to fetch"), 5xx e 401 (sessao velha - renova e tenta de novo)
// acontecem quando o Supabase esta instavel, e a 2a tentativa quase sempre passa.
async function requestLiveKitToken(channelId: string): Promise<{ token: string; url: string }> {
  let lastError: Error = new Error('falha ao gerar token do canal de voz')
  let forceRefresh = false
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const accessToken = await getAccessToken(forceRefresh)
      forceRefresh = false
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
      // So um 401 significa que a sessao precisa ser renovada. Antes qualquer falha de rede/5xx
      // forcava refresh nas tentativas seguintes; no WebView do EXE isso criava corridas com o
      // auto-refresh do Supabase e podia terminar em "invalid token".
      if (res.status === 401) {
        forceRefresh = true
        continue
      }
      // 4xx de verdade (sem acesso ao canal etc.) nao adianta repetir; 5xx usa o mesmo JWT.
      if (res.status < 500 && res.status !== 401) throw lastError
    } catch (err) {
      if (err instanceof TypeError) {
        lastError = new Error('Não consegui falar com o servidor de voz (rede ou instabilidade do Supabase). Tenta entrar de novo em instantes.')
      } else {
        throw err
      }
    }
    // Renovacao por 401 deve ser imediata; backoff fica apenas para rede/servidor instavel.
    if (!forceRefresh) await wait(500 * (attempt + 1))
  }
  throw lastError
}

export function fetchLiveKitToken(channelId: string): Promise<{ token: string; url: string }> {
  const cached = tokenCache.get(channelId)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = requestLiveKitToken(channelId).catch((error) => {
    tokenCache.delete(channelId)
    throw error
  })
  tokenCache.set(channelId, { expiresAt: Date.now() + TOKEN_CACHE_MS, promise })
  return promise
}

export function invalidateLiveKitToken(channelId: string) {
  tokenCache.delete(channelId)
}
