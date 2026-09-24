import { supabase } from './supabase'

// Verificacao de numero via WhatsApp: o usuario manda um codigo curto pro numero do WhatsApp
// Business do Thoth, um webhook (supabase/functions/whatsapp-webhook) confirma o numero de quem
// mandou (o WhatsApp ja verificou isso por SMS na hora que a pessoa criou a conta do WhatsApp -
// a gente so confia nessa verificacao, de graca, sem mandar SMS nosso). Ver CLAUDE.md.
const BUSINESS_NUMBER = import.meta.env.VITE_WHATSAPP_BUSINESS_NUMBER as string | undefined

export function whatsappVerifyAvailable() {
  return !!BUSINESS_NUMBER
}

export async function createWhatsAppVerificationCode(): Promise<string> {
  const { data, error } = await supabase.rpc('create_whatsapp_verification_code')
  if (error) throw error
  return data as string
}

export function whatsappVerifyUrl(code: string): string {
  const digits = (BUSINESS_NUMBER || '').replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Verificar ${code}`)}`
}

export async function getWhatsAppVerificationStatus(code: string): Promise<{ consumed: boolean; phoneLast4: string }> {
  const { data, error } = await supabase.rpc('get_whatsapp_verification_status', { p_code: code })
  if (error) throw error
  const row = data?.[0]
  return { consumed: !!row?.consumed, phoneLast4: row?.phone_last4 || '' }
}
