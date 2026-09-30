import { Capacitor, registerPlugin } from '@capacitor/core'

export type DeviceContact = {
  id: string
  name: string
  phones: string[]
  emails: string[]
}

export type ContactsPermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

type DeviceContactsPlugin = {
  selectOwnPhoneNumber(): Promise<{ phone: string }>
  permissionStatus(): Promise<{ state: ContactsPermissionState }>
  requestAccess(): Promise<{ state: ContactsPermissionState }>
  openSettings(): Promise<void>
  getContacts(): Promise<{ contacts: DeviceContact[] }>
  shareInvite(options: { text: string; phone?: string }): Promise<void>
  sendVerificationSms(options: { to: string; text: string; subscriptionId?: number }): Promise<void>
  getSimOptions(): Promise<{ sims: { subscriptionId: number; simSlot: number; label: string }[] }>
}

export type SimOption = { subscriptionId: number; simSlot: number; label: string }

const NativeContacts = registerPlugin<DeviceContactsPlugin>('DeviceContacts')

export const deviceContactsAvailable = () => Capacitor.isNativePlatform()

export async function selectOwnPhoneNumber() {
  if (!deviceContactsAvailable()) return ''
  return (await NativeContacts.selectOwnPhoneNumber()).phone || ''
}

export async function getContactsPermission() {
  if (!deviceContactsAvailable()) return 'denied' as const
  return (await NativeContacts.permissionStatus()).state
}

export async function requestContactsPermission() {
  return (await NativeContacts.requestAccess()).state
}

export async function openContactsSettings() {
  await NativeContacts.openSettings()
}

export async function readDeviceContacts() {
  const result = await NativeContacts.getContacts()
  return result.contacts || []
}

function whatsappPhone(phone?: string) {
  const digits = (phone || '').replace(/\D/g, '').replace(/^00/, '')
  if (!digits) return ''
  // A agenda brasileira normalmente salva apenas DDD + numero. O wa.me exige DDI.
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits
}

export async function shareThothInvite(name?: string, phone?: string) {
  const greeting = name ? `Oi, ${name}!` : 'Oi!'
  const url = 'https://facincanitech.github.io/thoth/site'
  const text = `${greeting} Vem conversar comigo no Thoth Messenger! Você pode usar pelo navegador ou baixar o app aqui:\n\n${url}`
  const directPhone = whatsappPhone(phone)
  if (deviceContactsAvailable()) {
    await NativeContacts.shareInvite({ text, phone: directPhone || undefined })
    return
  }
  if (directPhone) {
    window.open(`https://api.whatsapp.com/send?phone=${directPhone}&text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
    return
  }
  if (navigator.share) await navigator.share({ title: 'Convite para o Thoth Messenger', text })
  else await navigator.clipboard.writeText(text)
}

export async function sendVerificationSms(to: string, text: string, subscriptionId?: number) {
  if (!deviceContactsAvailable()) throw new Error('SMS so funciona pelo APK')
  await NativeContacts.sendVerificationSms({ to, text, subscriptionId })
}

// So retorna mais de 1 item em aparelho com 2 chips ativos - nesse caso a pessoa precisa
// escolher por qual numero mandar o SMS de confirmacao, o Android nao adivinha sozinho.
export async function getSimOptions(): Promise<SimOption[]> {
  if (!deviceContactsAvailable()) return []
  try {
    const result = await NativeContacts.getSimOptions()
    return result.sims || []
  } catch (err) {
    console.error('getSimOptions failed', err)
    return []
  }
}
