import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { displayName } from '../lib/displayName'
import { IconBell, IconChat, IconGamepad, IconGroup, IconHeart, IconPlus, IconStar, IconStatus, IconUser } from './icons'
import type { Profile } from '../types'
import thothLogo from '../../logo/toth_chat.png'

type Props = {
  me: Profile | null
  onRequireAuth: () => void
  onNewConversation: () => void
  onOpenAccount: () => void
  onOpenGroups: () => void
  onOpenCommunities: () => void
  onOpenStatus: () => void
  onOpenPlay: () => void
  onGoHome: () => void
  nudgeCount: number
  activeSection: 'chats' | 'new' | 'groups' | 'communities' | 'account' | 'status' | 'play'
}

export function Rail({ me, onRequireAuth, onNewConversation, onOpenAccount, onOpenGroups, onOpenCommunities, onOpenStatus, onOpenPlay, onGoHome, nudgeCount, activeSection }: Props) {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!me) {
      setPendingCount(0)
      return
    }

    async function load() {
      if (!me) return
      const { count } = await supabase
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('to_id', me.id)
        .eq('status', 'pending')
      setPendingCount(count || 0)
    }

    load()

    const channel = supabase
      .channel(`pending-requests:${me.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `to_id=eq.${me.id}` },
        () => load(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [me?.id])

  function handleAvatarClick() {
    if (!me) {
      onRequireAuth()
      return
    }
    onOpenAccount()
  }

  function handleGroupsClick() {
    if (!me) {
      onRequireAuth()
      return
    }
    onOpenGroups()
  }

  function handleCommunitiesClick() {
    if (!me) {
      onRequireAuth()
      return
    }
    onOpenCommunities()
  }

  function handleStatusClick() {
    if (!me) {
      onRequireAuth()
      return
    }
    onOpenStatus()
  }

  function handlePlayClick() {
    if (!me) {
      onRequireAuth()
      return
    }
    onOpenPlay()
  }

  return (
    <aside className="rail" aria-label="Navegação principal">
      <div className="rail-brand" aria-label="ThothChat">
        <img className="brand-image" src={thothLogo} alt="" />
        <span className="rail-wordmark">thoth</span>
      </div>
      <div className="rail-item">
        <button type="button" className="rail-link" onClick={onGoHome}
          aria-current={activeSection === 'chats' ? 'page' : undefined}
          title={nudgeCount > 0 ? 'Alguém chamou sua atenção' : 'Chats'}>
          <span className="rail-symbol"><IconChat size={22} /></span>
          <span className="rail-label">Chats</span>
        </button>
        {nudgeCount > 0 && (
          <span className="rail-badge" style={{ background: 'var(--green)' }}>
            <IconBell size={11} />
          </span>
        )}
      </div>
      <div className="rail-item">
        <button type="button" className="rail-link" title="Nova conversa" onClick={onNewConversation}
          aria-current={activeSection === 'new' ? 'page' : undefined}>
          <span className="rail-symbol"><IconPlus /></span>
          <span className="rail-label">Novo</span>
        </button>
        {pendingCount > 0 && (
          <span className="rail-badge" title={`${pendingCount} solicitação(ões) de amizade`}>
            <IconStar size={11} />
          </span>
        )}
      </div>
      <button type="button" className="rail-item rail-link" title="Status" onClick={handleStatusClick}
        aria-current={activeSection === 'status' ? 'page' : undefined}>
        <span className="rail-symbol"><IconStatus size={22} /></span>
        <span className="rail-label">Status</span>
      </button>
      <button type="button" className="rail-item rail-link" title="Grupos" onClick={handleGroupsClick}
        aria-current={activeSection === 'groups' ? 'page' : undefined}>
        <span className="rail-symbol"><IconGroup /></span>
        <span className="rail-label">Grupos</span>
      </button>
      <button type="button" className="rail-item rail-link" title="Comunidades" onClick={handleCommunitiesClick}
        aria-current={activeSection === 'communities' ? 'page' : undefined}>
        <span className="rail-symbol"><IconHeart /></span>
        <span className="rail-label rail-label-full">Comunidades</span><span className="rail-label rail-label-short">Comun.</span>
      </button>
      <button type="button" className="rail-item rail-link" title="Thoth Play" onClick={handlePlayClick}
        aria-current={activeSection === 'play' ? 'page' : undefined}>
        <span className="rail-symbol"><IconGamepad /></span>
        <span className="rail-label">Play</span>
      </button>
      <div className="spacer" />
      <button
        type="button"
        className="rail-item rail-link rail-account"
        onClick={handleAvatarClick}
        aria-current={activeSection === 'account' ? 'page' : undefined}
        title={me ? `${displayName(me)} — conta` : 'Entrar'}
      >
        <span className="avatar-sm">
          {me?.avatar_url ? <img src={me.avatar_url} alt="" /> : <IconUser size={18} />}
        </span>
        <span className="rail-label">{me ? 'Perfil' : 'Entrar'}</span>
      </button>
    </aside>
  )
}
