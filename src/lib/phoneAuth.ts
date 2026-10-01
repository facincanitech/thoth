import { supabase } from './supabase'
import { sendVerificationSms, selectOwnPhoneNumber, deviceContactsAvailable } from './deviceContacts'

// Login/cadastro por numero de celular, sem Google - reaproveita o mesmo celular-gateway de SMS
// (ver d:/Ares/ThothSmsGateway) que ja existe pra vincular numero numa conta logada. Diferenca:
// aqui ninguem esta logado ainda, entao o codigo e pedido por uma RPC publica (anon) que nao
// depende de auth.uid(). So funciona no APK (selectOwnPhoneNumber/SEND_SMS sao nativos Android).
const GATEWAY_NUMBER = import.meta.env.VITE_SMS_GATEWAY_NUMBER as string | undefined

export function phoneAuthAvailable() {
  return !!GATEWAY_NUMBER && deviceContactsAvailable()
}

export type PhoneAuthResult = { isNewAccount: boolean }

async function createPhoneAuthRequest(): Promise<{ code: string; claimToken: string }> {
  const { data, error } = await supabase.rpc('create_phone_auth_request')
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error('nao recebi codigo do servidor')
  return { code: row.code as string, claimToken: row.claim_token as string }
}

async function claimPhoneAuthSession(claimToken: string): Promise<{ consumed: boolean; isNewAccount: boolean; accessToken: string; refreshToken: string } | null> {
  const { data, error } = await supabase.rpc('claim_phone_auth_session', { p_claim_token: claimToken })
  if (error) throw error
  const row = data?.[0]
  if (!row?.consumed) return null
  return { consumed: true, isNewAccount: !!row.is_new_account, accessToken: row.access_token as string, refreshToken: row.refresh_token as string }
}

export async function setPhoneAccountEmail(email: string) {
  const { error } = await supabase.rpc('set_phone_account_email', { p_email: email })
  if (error) throw error
}

// Fluxo completo: detecta o numero (seletor nativo, sem digitar nada), manda o SMS sozinho pro
// gateway, e fica esperando o servidor confirmar - poll a cada 3s por ate 2 minutos. Quando
// confirma, aplica a sessao de verdade (supabase.auth.setSession) e avisa se a conta e nova
// (pra tela de login pedir o e-mail obrigatorio em seguida).
export async function signInWithPhoneNumber(onStatus?: (status: 'detecting' | 'sending' | 'waiting') => void): Promise<PhoneAuthResult> {
  if (!GATEWAY_NUMBER) throw new Error('numero gateway nao configurado')
  onStatus?.('detecting')
  // O seletor nativo (Play Services, Phone Number Hint) so serve pra MOSTRAR qual numero vai
  // usar - o servidor identifica o numero de verdade pelo remetente do SMS (igual o fluxo de
  // "Confirmar numero por SMS" ja faz), entao nao precisa travar o login se o seletor falhar.
  // A maioria dos chips brasileiros (Vivo/Claro/Tim/Oi) nao grava o proprio numero no SIM, entao
  // essa deteccao falha com frequencia - e so um "preview" opcional, nunca bloqueante. Mesma
  // armadilha de trava sem resolver nem rejeitar ja encontrada em changeLinkedPhone (ChatList.tsx).
  await Promise.race([
    selectOwnPhoneNumber(),
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
  ]).catch(() => '')

  onStatus?.('sending')
  const { code, claimToken } = await createPhoneAuthRequest()
  await sendVerificationSms(GATEWAY_NUMBER, `Entrar ${code}`)

  onStatus?.('waiting')
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const result = await claimPhoneAuthSession(claimToken)
    if (result) {
      const { error } = await supabase.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken })
      if (error) throw error
      return { isNewAccount: result.isNewAccount }
    }
  }
  throw new Error('não recebemos a confirmação a tempo - verifica se o SMS foi enviado e tenta de novo')
}
