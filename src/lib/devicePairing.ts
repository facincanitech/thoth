import QRCode from 'qrcode'
import { supabase } from './supabase'

// Parear navegador/EXE com o celular via QR code (estilo WhatsApp Web) - usado tanto pra logar
// um dispositivo sem numero/camera (web, EXE) quanto pra obrigar a vincular numero antes de usar
// o app. Ver device_pairing_requests (migration 118) e a Edge Function device-pairing-approve.

const PAIR_BASE_URL = 'https://facincanitech.github.io/thoth/'

export function pairingUrl(token: string): string {
  return `${PAIR_BASE_URL}?pair=${token}`
}

export async function createDevicePairingRequest(): Promise<{ token: string; claimToken: string }> {
  const { data, error } = await supabase.rpc('create_device_pairing_request')
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('nao recebi codigo do servidor')
  return { token: row.token as string, claimToken: row.claim_token as string }
}

export async function claimDevicePairingSession(claimToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const { data, error } = await supabase.rpc('claim_device_pairing_session', { p_claim_token: claimToken })
  if (error) throw error
  const row = data?.[0]
  if (!row?.consumed) return null
  return { accessToken: row.access_token as string, refreshToken: row.refresh_token as string }
}

export async function renderPairingQrCode(token: string): Promise<string> {
  return QRCode.toDataURL(pairingUrl(token), { width: 220, margin: 1 })
}

// Poll a cada 3s por ate 10 minutos (mesmo prazo de validade do pedido no banco) esperando o
// celular aprovar. Devolve null se expirar sem ninguem escanear/aprovar.
export async function waitForDevicePairing(claimToken: string, onTick?: () => void): Promise<{ accessToken: string; refreshToken: string } | null> {
  const deadline = Date.now() + 10 * 60_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    onTick?.()
    const result = await claimDevicePairingSession(claimToken)
    if (result) return result
  }
  return null
}

// Chamado pelo CELULAR (ja logado) depois de abrir o link escaneado - aprova o pareamento pro
// navegador/EXE que mostrou o QR code. So funciona se a conta do celular ja tem numero vinculado
// ('needs_phone' = precisa vincular primeiro, ver AuthGate.tsx).
export async function approveDevicePairing(token: string): Promise<'approved' | 'needs_phone'> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) throw new Error('sem sessão')

  const res = await fetch('https://eeyypnkbiejvficybhxu.supabase.co/functions/v1/device-pairing-approve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ token }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'falha ao aprovar pareamento')
  return body.status
}

// Le o ?pair=<token> da URL atual, se tiver (link do QR code aberto dentro do app via deep link
// https, ver AndroidManifest.xml).
export function pendingPairToken(): string | null {
  return new URLSearchParams(window.location.search).get('pair')
}
