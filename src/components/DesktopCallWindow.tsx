import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { CallOverlay, type CallOverlayHandle } from './CallOverlay'
import { DesktopTitleBar } from './DesktopChrome'
import { currentWindow } from '../lib/desktopWindows'
import type { OutgoingCallRequest } from '../lib/call'
import type { Profile } from '../types'

// Janela propria das chamadas de voz/video (desktop): fica escondida ate tocar/ligar,
// assim a chamada nao troca a tela de contatos nem a conversa com o amigo.
export function DesktopCallWindow() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const overlayRef = useRef<CallOverlayHandle>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('id, username, email, status, last_seen_at, display_name, avatar_url, is_idle, age, city, banner_color, banner_image_url, banner_image_position, app_bg_color, app_sidebar_color, app_button_color, app_text_size, name_style_font, name_style_effect, name_style_color')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data as Profile))
  }, [session])

  useEffect(() => {
    const unlistens: (() => void)[] = []
    import('@tauri-apps/api/event').then(async ({ listen }) => {
      unlistens.push(await listen<OutgoingCallRequest>('call-start', async (e) => {
        if (!overlayRef.current) return
        overlayRef.current.startCall(e.payload)
        const { emit } = await import('@tauri-apps/api/event')
        await emit('call-start-ack')
      }))
      unlistens.push(await listen('call-hangup', () => overlayRef.current?.hangup()))
    })
    return () => unlistens.forEach((u) => u())
  }, [])

  async function handleActiveChange(active: boolean) {
    const win = currentWindow()
    if (active) {
      await win.unminimize().catch(() => {})
      await win.show().catch(() => {})
      await win.setFocus().catch(() => {})
    } else {
      await win.hide().catch(() => {})
    }
  }

  return (
    <div className="desktop-window-shell desktop-call-shell">
      <DesktopTitleBar title="Chamada" />
      <div className="app desktop-call-app">
        {profile && <CallOverlay ref={overlayRef} me={profile} onActiveChange={handleActiveChange} />}
      </div>
    </div>
  )
}
