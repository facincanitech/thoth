import { supabase } from './supabase'
import { sendVerificationSms, deviceContactsAvailable } from './deviceContacts'

// Verificacao de numero via SMS de verdade: o app manda um SMS com o codigo sozinho (SEND_SMS,
// sem abrir o app de Mensagens) pro numero-gateway do Thoth; um celular nosso configurado como
// "celular-gateway" (ver smsGateway.ts) recebe de verdade e confirma via Edge Function
// sms-webhook. So funciona no APK (SEND_SMS nao existe em web/desktop). Ver CLAUDE.md.
const GATEWAY_NUMBER = import.meta.env.VITE_SMS_GATEWAY_NUMBER as string | undefined

export function smsVerifyAvailable() {
  return !!GATEWAY_NUMBER && deviceContactsAvailable()
}

export async function createSmsVerificationCode(): Promise<string> {
  const { data, error } = await supabase.rpc('create_sms_verification_code')
  if (error) throw error
  return data as string
}

export async function sendSmsVerification(code: string) {
  if (!GATEWAY_NUMBER) throw new Error('numero gateway nao configurado')
  await sendVerificationSms(GATEWAY_NUMBER, `Verificar ${code}`)
}

export async function getSmsVerificationStatus(code: string): Promise<{ consumed: boolean; phoneLast4: string }> {
  const { data, error } = await supabase.rpc('get_sms_verification_status', { p_code: code })
  if (error) throw error
  const row = data?.[0]
  return { consumed: !!row?.consumed, phoneLast4: row?.phone_last4 || '' }
}
