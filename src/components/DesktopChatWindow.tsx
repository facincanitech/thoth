import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { MainPanel } from './MainPanel'
import { DesktopTitleBar } from './DesktopChrome'
import { currentWindow, requestCall, type DesktopChatWink } from '../lib/desktopWindows'
import { playCustomWinkEffect, playWinkEffect } from '../lib/winks'
import { useHeartbeat } from '../lib/useHeartbeat'
import type { Conversation, Profile } from '../types'

type Props = {
  conversationId: string
}

export function DesktopChatWindow({ conversationId }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())

  useHeartbeat(session?.user.id)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen<DesktopChatWink>('desktop-chat-wink', ({ payload }) => {
        if (payload.conversationId !== conversationId) return
        if (payload.winkId) playWinkEffect(payload.winkId)
        else if (payload.imageData) playCustomWinkEffect(payload.imageData, payload.soundData ?? null)
      }),
    ).then((fn) => { unlisten = fn })
    return () => unlisten?.()
  }, [conversationId])

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
    if (!profile) {
      setBlockedIds(new Set())
      return
    }
    supabase.from('blocks').select('blocked_id').eq('blocker_id', profile.id).then(({ data }) => {
      setBlockedIds(new Set((data || []).map((r) => r.blocked_id as string)))
    })
  }, [profile?.id])

  useEffect(() => {
    supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle().then(({ data }) => {
      if (data) setConversation(data as Conversation)
    })
  }, [conversationId])

  return (
    <div className="desktop-window-shell desktop-chat-shell">
      <DesktopTitleBar title={conversation?.name ? `${conversation.name} — Conversa` : 'Thoth Messenger'} />
      <div className="app chat-open desktop-chat-app">
        {profile && conversation ? (
          <MainPanel
            me={profile}
            conversation={conversation}
            onBack={() => { currentWindow().close() }}
            onConversationUpdate={(patch) => setConversation((c) => (c ? { ...c, ...patch } : c))}
            blockedIds={blockedIds}
            onOpenCommunity={() => { /* comunidade a partir de uma janela de chat solta ainda nao tem tratamento dedicado */ }}
            onStartCall={(peer, kind) => requestCall({ peer, kind, conversationId })}
          />
        ) : (
          <div style={{ padding: 24 }}>carregando...</div>
        )}
      </div>
    </div>
  )
}
