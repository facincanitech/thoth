import { Capacitor, registerPlugin } from '@capacitor/core'

export type DeviceContact = {
  id: string
  name: string
  phones: string[]
  emails: string[]
}

export type ContactsPermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

type DeviceContactsPlugin = {
  permissionStatus(): Promise<{ state: ContactsPermissionState }>
  requestAccess(): Promise<{ state: ContactsPermissionState }>
  openSettings(): Promise<void>
  getContacts(): Promise<{ contacts: DeviceContact[] }>
  shareInvite(options: { text: string }): Promise<void>
}

const NativeContacts = registerPlugin<DeviceContactsPlugin>('DeviceContacts')

export const deviceContactsAvailable = () => Capacitor.isNativePlatform()

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

export async function shareThothInvite(name?: string) {
  const greeting = name ? `Oi, ${name}!` : 'Oi!'
  const text = `${greeting} Estou usando o Thoth Messenger. Entra por aqui: https://facincanitech.github.io/thoth/`
  if (deviceContactsAvailable()) {
    await NativeContacts.shareInvite({ text })
    return
  }
  if (navigator.share) await navigator.share({ title: 'Thoth Messenger', text, url: 'https://facincanitech.github.io/thoth/' })
  else await navigator.clipboard.writeText(text)
}
