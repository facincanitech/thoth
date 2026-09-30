import { Capacitor, registerPlugin } from '@capacitor/core'

// So usado no celular que vira o "servidor" de SMS (recebe de verdade o SMS que chega no chip
// com o numero definitivo e repassa pra Edge Function sms-webhook). Tela avancada, escondida -
// qualquer usuario comum do Thoth nunca ve nem precisa disso.
type SmsGatewayPlugin = {
  getStatus(): Promise<{ enabled: boolean; hasPermission: boolean; token: string; webhookUrl: string }>
  enable(options: { token: string; webhookUrl: string }): Promise<{ enabled: boolean }>
  disable(): Promise<{ enabled: boolean }>
}

const SmsGateway = registerPlugin<SmsGatewayPlugin>('SmsGateway')

export const smsGatewayAvailable = () => Capacitor.isNativePlatform()

export async function getSmsGatewayStatus() {
  if (!smsGatewayAvailable()) return { enabled: false, hasPermission: false, token: '', webhookUrl: '' }
  return SmsGateway.getStatus()
}

export async function enableSmsGateway(token: string, webhookUrl: string) {
  return SmsGateway.enable({ token, webhookUrl })
}

export async function disableSmsGateway() {
  return SmsGateway.disable()
}
