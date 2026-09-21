import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ThothPlay } from './ThothPlay'
import { DesktopTitleBar } from './DesktopChrome'
import { currentWindow } from '../lib/desktopWindows'
import { useHeartbeat } from '../lib/useHeartbeat'
import type { Profile } from '../types'

export function DesktopPlayWindow() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useHeartbeat(session?.user.id)

  useEffect(() => {
    if (!session) return
    supabase
      .from('profiles')
      .select('id, username, email, status, last_seen_at, display_name, avatar_url, is_idle, age, city, banner_color, banner_image_url, banner_image_position, app_bg_color, app_sidebar_color, app_button_color, app_text_size, name_style_font, name_style_effect, name_style_color')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data as Profile))
  }, [session])

  // Fechar (X) so esconde e manda pra bandeja, igual a janela principal - o
  // Thoth Play continua rodando (canal de voz, etc.), nao mata o processo.
  // Reabre pelo menu "Thoth Play" da bandeja. O intercept e feito no lado Rust
  // (RunEvent global, cobre essa janela dinamica tambem), aqui e so o .close()
  // normal - o Rust decide se de fato fecha ou so esconde.

  return (
    <div className="desktop-window-shell play-window-shell">
      <DesktopTitleBar title="Thoth Play" />
      <div className="app play-desktop-app">
        {profile ? (
          <ThothPlay me={profile} onBack={() => currentWindow().close()} />
        ) : (
          <div style={{ padding: 24 }}>carregando...</div>
        )}
      </div>
    </div>
  )
}
