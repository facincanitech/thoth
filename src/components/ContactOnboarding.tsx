import { useEffect, useState } from 'react'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'
import {
  deviceContactsAvailable,
  readDeviceContacts,
  requestContactsPermission,
  selectOwnPhoneNumber,
} from '../lib/deviceContacts'
import { IconCheck, IconUser } from './icons'

type Props = { me: Profile; onOpenContacts: () => void }
type Step = 'intro' | 'confirm' | 'contacts' | 'done'

function displayPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  if (local.length === 11) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return value
}

export function ContactOnboarding({ me, onOpenContacts }: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('intro')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [found, setFound] = useState(0)

  useEffect(() => {
    if (!deviceContactsAvailable()) return
    supabase.rpc('get_my_contact_discovery').then(({ data, error }) => {
      if (error) {
        console.error('contact onboarding status failed', error)
        return
      }
      const status = data?.[0]
      if (!status?.onboarding_seen) setOpen(true)
    })
  }, [me.id])

  async function dismiss() {
    await supabase.rpc('mark_contact_onboarding_seen')
    setOpen(false)
  }

  async function choosePhone() {
    setBusy(true)
    setMessage(null)
    try {
      const selected = await selectOwnPhoneNumber()
      if (!selected) {
        setMessage('O Android não encontrou um número neste aparelho. Você ainda pode encontrar pessoas pelo e-mail.')
        return
      }
      setPhone(selected)
      setStep('confirm')
    } catch (error) {
      console.error('phone hint failed', error)
      setMessage('Não foi possível obter o número deste aparelho.')
    } finally {
      setBusy(false)
    }
  }

  async function linkPhone() {
    setBusy(true)
    setMessage(null)
    try {
      const { error } = await supabase.rpc('link_device_phone', { p_phone: phone })
      if (error) throw error
      setStep('contacts')
    } catch (error) {
      console.error('link device phone failed', error)
      const text = error instanceof Error && error.message.includes('already linked')
        ? 'Este número já está vinculado a outra conta.'
        : 'Não foi possível vincular este número.'
      setMessage(text)
    } finally {
      setBusy(false)
    }
  }

  async function allowContacts() {
    setBusy(true)
    setMessage(null)
    try {
      const permission = await requestContactsPermission()
      if (permission !== 'granted') {
        setMessage('Sem acesso à agenda. Você pode permitir depois em Perfil → Privacidade.')
        return
      }
      const contacts = await readDeviceContacts()
      const emails = [...new Set(contacts.flatMap((item) => item.emails).map((v) => v.trim().toLowerCase()).filter(Boolean))]
      const phones = [...new Set(contacts.flatMap((item) => item.phones).map((v) => v.trim()).filter(Boolean))]
      const { data, error } = await supabase.rpc('sync_contact_identifiers', { p_emails: emails, p_phones: phones })
      if (error) throw error
      setFound(data?.length || 0)
      setStep('done')
    } catch (error) {
      console.error('onboarding contact sync failed', error)
      setMessage('Não foi possível sincronizar agora. Tente novamente em Perfil → Privacidade.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-backdrop contact-onboarding-backdrop">
      <div className="modal-card contact-onboarding-card">
        <div className="contact-onboarding-icon">{step === 'done' ? <IconCheck size={30} /> : <IconUser size={30} />}</div>
        {step === 'intro' && <>
          <h2>Quer encontrar seus contatos?</h2>
          <p>Vincule o número oferecido pelo seu aparelho e descubra quem já usa o Thoth. Seu número não ficará público.</p>
          <button type="button" className="google-btn" disabled={busy} onClick={choosePhone}>{busy ? 'Abrindo…' : 'Selecionar meu número'}</button>
          <button type="button" className="modal-close" onClick={dismiss}>Agora não</button>
        </>}
        {step === 'confirm' && <>
          <h2>Este é seu número?</h2>
          <div className="contact-onboarding-phone">{displayPhone(phone)}</div>
          <p>Ele será ligado à conta Google de {me.email} apenas para encontrar contatos.</p>
          <button type="button" className="google-btn" disabled={busy} onClick={linkPhone}>{busy ? 'Vinculando…' : 'Sim, vincular'}</button>
          <button type="button" className="modal-close" onClick={() => setStep('intro')}>Escolher outro</button>
        </>}
        {step === 'contacts' && <>
          <h2>Agora permita sua agenda</h2>
          <p>O Thoth compara telefones e e-mails e salva somente os perfis encontrados. A agenda bruta permanece no aparelho.</p>
          <button type="button" className="google-btn" disabled={busy} onClick={allowContacts}>{busy ? 'Procurando…' : 'Permitir agenda'}</button>
          <button type="button" className="modal-close" onClick={dismiss}>Fazer depois</button>
        </>}
        {step === 'done' && <>
          <h2>Contatos encontrados</h2>
          <p>{found === 1 ? 'Encontramos 1 pessoa no Thoth.' : `Encontramos ${found} pessoas no Thoth.`}</p>
          <button type="button" className="google-btn" onClick={() => { setOpen(false); onOpenContacts() }}>Ver contatos</button>
        </>}
        {message && <p className="auth-error contact-onboarding-message">{message}</p>}
      </div>
    </div>
  )
}
