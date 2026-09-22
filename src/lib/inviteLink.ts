export function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 10)
}

const BASE_URL = 'https://facincanitech.github.io/thoth/'

export function inviteUrl(code: string): string {
  return `${BASE_URL}?invite=${code}`
}

export function playInviteUrl(code: string): string {
  return `${BASE_URL}?play=${code}`
}

// Link direto pro app instalado (thoth:// e um protocolo custom registrado tanto no instalador
// do desktop quanto no AndroidManifest, host=invite/host=play). Clicar nisso sem o app instalado
// nao da erro visivel pro usuario (o navegador so ignora), por isso o InviteChooser sempre mostra
// tambem a opcao de baixar/continuar no navegador.
export function inviteDeepLink(kind: 'invite' | 'play', code: string): string {
  return `thoth://${kind}/${code}`
}

// Le de volta o thoth://invite/<code> ou thoth://play/<code> quando o app ja instalado e aberto
// por esse link (deep-link do desktop/Android). null se a url nao for um desses dois formatos.
export function parseInviteDeepLink(url: string): { kind: 'invite' | 'play'; code: string } | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'thoth:' && u.protocol !== 'ferus:') return null
    if (u.hostname !== 'invite' && u.hostname !== 'play') return null
    const code = u.pathname.replace(/^\//, '')
    if (!code) return null
    return { kind: u.hostname as 'invite' | 'play', code }
  } catch {
    return null
  }
}
