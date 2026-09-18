import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { App as CapacitorApp } from '@capacitor/app'
import { supabase } from './lib/supabase'
import { Rail } from './components/Rail'
import { ChatList } from './components/ChatList'
import { MainPanel } from './components/MainPanel'
import { CommunityView } from './components/CommunityView'
import { AuthModal } from './components/AuthModal'
import { CallOverlay, type CallOverlayHandle } from './components/CallOverlay'
import type { Community, Conversation, PanelView, Profile } from './types'
import type { GroupsView } from './components/ChatList'
import { APP_VERSION } from './version'
import { playNudgeSound, triggerNudgeShake } from './lib/nudge'
import { playWinkEffect, playCustomWinkEffect } from './lib/winks'
import { saveCustomWink, type CustomWink } from './lib/customWinks'
import { registerPushNotifications, setCurrentConversationId, clearAllNotifications } from './lib/pushNotifications'
import { promptDisableBatteryOptimization, promptFullScreenIntentPermission } from './lib/batteryOpt'
import { readCache, writeCache } from './lib/cache'
import { pickTextColor } from './lib/appTheme'
import { isTauriDesktop } from './lib/platform'
import { openChatWindow } from './lib/desktopWindows'
import { DesktopTitleBar } from './components/DesktopChrome'
import './App.css'

type Theme = 'dark' | 'light' | 'contrast' | 'frutiger'

function App() {
  useEffect(() => {
    document.title = `ThothChat v${APP_VERSION}`
  }, [])

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('ferus-theme')
      if (saved === 'dark' || saved === 'light' || saved === 'contrast' || saved === 'frutiger') return saved
    } catch {
      // ignore
    }
    return 'light'
  })

  useEffect(() => {
    // ThothChat Messenger (desktop/Tauri) tem visual proprio e fixo, sem sistema de
    // tema - o CSS dele (thothchat-messenger/thothmessenger.css) e carregado em main.tsx antes
    // do app montar e nao depende de data-theme nenhum. Nao mexe nisso aqui.
    if (isTauriDesktop) return
    if (theme === 'dark') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('ferus-theme', theme)
    } catch {
      // ignore
    }
  }, [theme])

  useEffect(() => {
    const listenerPromise = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const hashIndex = url.indexOf('#')
      if (hashIndex === -1) return
      const params = new URLSearchParams(url.slice(hashIndex + 1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token })
      }
    })
    return () => {
      listenerPromise.then((l) => l.remove())
    }
  }, [])

  useEffect(() => {
    if (!isTauriDesktop) return
    function handleDeepLinkUrl(url: string) {
      const hashIndex = url.indexOf('#')
      if (hashIndex === -1) return
      const params = new URLSearchParams(url.slice(hashIndex + 1))
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      if (access_token && refresh_token) {
        supabase.auth.setSession({ access_token, refresh_token })
      }
    }
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen<string>('deep-link', (event) => handleDeepLinkUrl(event.payload)),
    ).then((fn) => { unlisten = fn })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    let hiddenAt: number | null = null
    function onVisibility() {
      if (document.hidden) {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt && Date.now() - hiddenAt > 60000) {
        window.location.reload()
      }
      hiddenAt = null
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const navStateRef = useRef({ panelOpen: false, accountOpen: false, groupsOpen: false, statusOpen: false, selectedCommunity: false, selected: false })

  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const lastUserId = localStorage.getItem('flux-last-user-id')
      if (!lastUserId) return null
      return readCache<Profile>(`flux-profile:${lastUserId}`)
    } catch {
      return null
    }
  })
  useEffect(() => {
    const root = document.documentElement.style
    function applyVar(cssVar: string, value: string | null | undefined, textVar?: string) {
      if (value) {
        root.setProperty(cssVar, value)
        if (textVar) {
          const t = pickTextColor(value)
          if (t) root.setProperty(textVar, t)
          else root.removeProperty(textVar)
        }
      } else {
        root.removeProperty(cssVar)
        if (textVar) root.removeProperty(textVar)
      }
    }
    applyVar('--bg-deep', profile?.app_bg_color, '--text')
    applyVar('--bg-panel', profile?.app_bg_color)
    applyVar('--rail-bg', profile?.app_sidebar_color, '--rail-icon')
    applyVar('--green', profile?.app_button_color, '--on-button')
    applyVar('--btn-custom', profile?.app_button_color)
    applyVar('--card-custom', profile?.app_card_color, '--on-card')
    applyVar('--in-custom', profile?.app_incoming_color, '--on-in')
    applyVar('--out-custom', profile?.app_outgoing_color, '--on-out')
    const zoom = profile?.app_text_size === 'small' ? '0.85' : profile?.app_text_size === 'large' ? '1.15' : null
    applyVar('--ui-zoom', zoom)
  }, [
    profile?.app_bg_color,
    profile?.app_sidebar_color,
    profile?.app_button_color,
    profile?.app_card_color,
    profile?.app_incoming_color,
    profile?.app_outgoing_color,
    profile?.app_text_size,
  ])

  const [selected, setSelected] = useState<Conversation | null>(null)
  const restoredSelectedRef = useRef(false)
  const [pendingInviteCode] = useState(() => new URLSearchParams(window.location.search).get('invite'))
  const inviteConsumedRef = useRef(false)
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null)
  const [communityTab, setCommunityTab] = useState<'home' | 'info' | 'members' | 'settings'>('home')
  const [authOpen, setAuthOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelView, setPanelView] = useState<PanelView>('root')
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountResetKey, setAccountResetKey] = useState(0)
  const callOverlayRef = useRef<CallOverlayHandle>(null)
  const [groupsRestoreView, setGroupsRestoreView] = useState<GroupsView | null>(null)

  function leaveGroupsPanel(fromView: GroupsView) {
    setGroupsRestoreView(fromView)
    setGroupsOpen(false)
  }
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [groupsSection, setGroupsSection] = useState<'groups' | 'communities'>('groups')
  const [statusOpen, setStatusOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setCurrentConversationId(selected?.id || null)
  }, [selected?.id])

  useEffect(() => {
    navStateRef.current = { panelOpen, accountOpen, groupsOpen, statusOpen, selectedCommunity: !!selectedCommunity, selected: !!selected }
  }, [panelOpen, accountOpen, groupsOpen, statusOpen, selectedCommunity, selected])

  useEffect(() => {
    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      const s = navStateRef.current
      if (s.panelOpen) setPanelOpen(false)
      else if (s.accountOpen) setAccountOpen(false)
      else if (s.groupsOpen) setGroupsOpen(false)
      else if (s.statusOpen) setStatusOpen(false)
      else if (s.selectedCommunity) setSelectedCommunity(null)
      else if (s.selected) setSelected(null)
      else CapacitorApp.exitApp()
    })
    return () => {
      listenerPromise.then((l) => l.remove())
    }
  }, [])
  const [nudgers, setNudgers] = useState<{ fromId: string; conversationId: string; at: number }[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setSelected(null)
        try {
          localStorage.removeItem('flux-last-user-id')
        } catch {
          // ignore
        }
      } else {
        setAuthOpen(false)
      }
      if (window.location.hash || window.location.search) {
        window.history.replaceState(null, '', window.location.pathname)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    try {
      localStorage.setItem('flux-last-user-id', session.user.id)
    } catch {
      // ignore
    }
    supabase
      .from('profiles')
      .select('id, username, email, status, last_seen_at, display_name, avatar_url, is_idle, age, city, banner_color, banner_image_url, banner_image_position, app_bg_color, app_sidebar_color, app_button_color, app_text_size, name_style_font, name_style_effect, name_style_color')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) writeCache(`flux-profile:${session.user.id}`, data)
        setProfile(data as Profile)
      })
  }, [session])

  useEffect(() => {
    if (!profile) return
    registerPushNotifications(profile.id).catch(() => {})
    promptDisableBatteryOptimization().catch(() => {})
    promptFullScreenIntentPermission().catch(() => {})
    clearAllNotifications()
  }, [profile?.id])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') clearAllNotifications()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const lastActivityRef = useRef(Date.now())

  useEffect(() => {
    if (!session) return
    const IDLE_THRESHOLD_MS = 120000

    function markActive() {
      lastActivityRef.current = Date.now()
    }
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    activityEvents.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }))

    const heartbeat = () => {
      const isIdle = Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS
      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString(), is_idle: isIdle })
        .eq('id', session.user.id)
        .then()
    }
    heartbeat()
    const interval = setInterval(heartbeat, 30000)
    document.addEventListener('visibilitychange', heartbeat)
    return () => {
      clearInterval(interval)
      activityEvents.forEach((ev) => window.removeEventListener(ev, markActive))
      document.removeEventListener('visibilitychange', heartbeat)
    }
  }, [session])

  useEffect(() => {
    if (!profile) {
      setBlockedIds(new Set())
      return
    }

    async function load() {
      if (!profile) return
      const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', profile.id)
      setBlockedIds(new Set((data || []).map((r) => r.blocked_id as string)))
    }

    load()

    const channel = supabase
      .channel(`blocks:${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks', filter: `blocker_id=eq.${profile.id}` },
        () => load(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  const [mutedIds, setMutedIds] = useState<Set<string>>(new Set())
  const mutedIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    mutedIdsRef.current = mutedIds
  }, [mutedIds])

  useEffect(() => {
    if (!profile) {
      setMutedIds(new Set())
      return
    }

    async function load() {
      if (!profile) return
      const { data } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profile.id)
        .eq('muted', true)
      setMutedIds(new Set((data || []).map((r) => r.conversation_id as string)))
    }

    load()

    const channel = supabase
      .channel(`muted:${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${profile.id}` },
        () => load(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel(`nudge:${profile.id}`)
      .on('broadcast', { event: 'nudge' }, ({ payload }) => {
        const { userId, conversationId } = payload as { userId: string; conversationId?: string }
        if (conversationId && mutedIdsRef.current.has(conversationId)) return
        triggerNudgeShake()
        playNudgeSound()
        if (!conversationId) return
        setNudgers((prev) => {
          if (prev.some((n) => n.conversationId === conversationId)) return prev
          return [...prev, { fromId: userId, conversationId, at: Date.now() }]
        })
        setTimeout(() => {
          setNudgers((prev) => prev.filter((n) => n.conversationId !== conversationId))
        }, 600000)
      })
      .on('broadcast', { event: 'wink' }, ({ payload }) => {
        const { conversationId, winkId } = payload as { userId: string; conversationId?: string; winkId?: string }
        if (conversationId && mutedIdsRef.current.has(conversationId)) return
        if (winkId) playWinkEffect(winkId)
      })
      .on('broadcast', { event: 'customWink' }, ({ payload }) => {
        const { userId, conversationId, label, imageData, soundData } = payload as {
          userId: string
          conversationId?: string
          label: string
          imageData: string
          soundData: string | null
        }
        if (conversationId && mutedIdsRef.current.has(conversationId)) return
        playCustomWinkEffect(imageData, soundData)
        const wink: CustomWink = { id: crypto.randomUUID(), label, imageData, soundData, fromUser: userId }
        saveCustomWink(wink).catch(() => {})
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  useEffect(() => {
    if (!selected) return
    setNudgers((prev) => prev.filter((n) => n.conversationId !== selected.id))
  }, [selected?.id])

  useEffect(() => {
    if (selected) localStorage.setItem('flux-last-conversation', selected.id)
    else if (restoredSelectedRef.current) localStorage.removeItem('flux-last-conversation')
  }, [selected?.id])

  useEffect(() => {
    if (!profile || restoredSelectedRef.current || selected || pendingInviteCode) return
    restoredSelectedRef.current = true
    const lastId = localStorage.getItem('flux-last-conversation')
    if (!lastId) return
    supabase.from('conversations').select('*').eq('id', lastId).maybeSingle().then(({ data }) => {
      if (data) setSelected(data as Conversation)
    })
  }, [profile?.id])

  useEffect(() => {
    if (!pendingInviteCode) return
    if (session === null) {
      setAuthOpen(true)
      return
    }
    if (!profile || inviteConsumedRef.current) return
    inviteConsumedRef.current = true
    ;(async () => {
      const { data: groupRows } = await supabase.rpc('get_group_by_invite_code', { p_code: pendingInviteCode })
      const group = groupRows?.[0]
      if (group) {
        if (group.invite_requires_approval) {
          await supabase.from('conversation_join_requests').insert({ conversation_id: group.id, user_id: profile.id })
          alert(`Pedido pra entrar em "${group.name}" enviado — aguarde um admin aceitar.`)
          return
        }
        await supabase.from('conversation_members').insert({ conversation_id: group.id, user_id: profile.id })
        const { data: conv } = await supabase.from('conversations').select('*').eq('id', group.id).maybeSingle()
        if (conv) setSelected(conv as Conversation)
        return
      }
      const { data: community } = await supabase.from('communities').select('*').eq('invite_code', pendingInviteCode).maybeSingle()
      if (community) {
        await supabase.from('community_members').insert({ community_id: community.id, user_id: profile.id })
        setSelectedCommunity(community as Community)
        setCommunityTab('home')
      }
    })()
  }, [pendingInviteCode, session, profile?.id])

  async function openNudger() {
    if (nudgers.length === 0) {
      goHome()
      return
    }
    const target = nudgers[0]
    setNudgers((prev) => prev.filter((n) => n.conversationId !== target.conversationId))
    const { data } = await supabase.from('conversations').select('*').eq('id', target.conversationId).single()
    if (data) {
      setStatusOpen(false)
      setSelected(data as Conversation)
    }
  }

  function requireAuth(action: () => void) {
    if (session === undefined) return
    if (!session) {
      setAuthOpen(true)
      return
    }
    action()
  }

  function openNewConversation() {
    requireAuth(() => {
      setStatusOpen(false)
      setAccountOpen(false)
      setGroupsOpen(false)
      setPanelView('root')
      setPanelOpen(true)
    })
  }

  function openAccount() {
    requireAuth(() => {
      setStatusOpen(false)
      setPanelOpen(false)
      setGroupsOpen(false)
      setAccountOpen(true)
      setAccountResetKey((k) => k + 1)
    })
  }

  function openGroups() {
    requireAuth(() => {
      setStatusOpen(false)
      setPanelOpen(false)
      setAccountOpen(false)
      setGroupsRestoreView('group-root')
      setGroupsSection('groups')
      setGroupsOpen(true)
      try {
        localStorage.setItem('ferus-visited-groups', '1')
      } catch {
        // ignore
      }
    })
  }

  function openCommunities() {
    requireAuth(() => {
      setStatusOpen(false)
      setPanelOpen(false)
      setAccountOpen(false)
      setGroupsRestoreView('community-root')
      setGroupsSection('communities')
      setGroupsOpen(true)
      try {
        localStorage.setItem('ferus-visited-groups', '1')
      } catch {
        // ignore
      }
    })
  }

  function goHome() {
    setSelected(null)
    setSelectedCommunity(null)
    setPanelOpen(false)
    setAccountOpen(false)
    setGroupsOpen(false)
    setStatusOpen(false)
  }

  function openStatus() {
    setSelected(null)
    setSelectedCommunity(null)
    setPanelOpen(false)
    setAccountOpen(false)
    setGroupsOpen(false)
    setStatusOpen(true)
    try {
      localStorage.setItem('ferus-visited-status', '1')
    } catch {
      // ignore
    }
  }

  const [inviteDemoSignal, setInviteDemoSignal] = useState(0)

  function openChatInviteDemo(conversation: Conversation) {
    setStatusOpen(false)
    setSelectedCommunity(null)
    setPanelOpen(false)
    setAccountOpen(false)
    setGroupsOpen(false)
    setSelected(conversation)
    setInviteDemoSignal((k) => k + 1)
  }

  const anyPanelOpen = panelOpen || accountOpen || groupsOpen || statusOpen
  const isGroupContext = selected?.type === 'group' || !!selectedCommunity

  const appTree = (
    <div className={`app${selected || selectedCommunity ? ' chat-open' : ''}${anyPanelOpen ? ' panel-open' : ''}${sidebarCollapsed && isGroupContext ? ' sidebar-collapsed' : ''}`}>
      {(!isTauriDesktop || profile) && <Rail
        me={profile}
        onRequireAuth={() => requireAuth(() => {})}
        onNewConversation={openNewConversation}
        onOpenAccount={openAccount}
        onOpenGroups={openGroups}
        onOpenCommunities={openCommunities}
        onOpenStatus={openStatus}
        onGoHome={openNudger}
        nudgeCount={nudgers.length}
        activeSection={
          statusOpen ? 'status'
            : accountOpen ? 'account'
            : panelOpen ? 'new'
            : groupsOpen ? groupsSection
            : selectedCommunity ? 'communities'
            : 'chats'
        }
      />}
      <ChatList
        me={profile}
        selected={selected}
        onSelect={(c) => {
          if (isTauriDesktop) {
            if (c) openChatWindow(c.id, c.name || 'Conversa')
            return
          }
          setSelectedCommunity(null)
          setSelected(c)
        }}
        onSelectCommunity={(c) => { setSelected(null); setCommunityTab('home'); setSelectedCommunity(c) }}
        selectedCommunity={selectedCommunity}
        communityTab={communityTab}
        onCommunityTabChange={setCommunityTab}
        onCommunityBack={() => setSelectedCommunity(null)}
        panelOpen={panelOpen}
        panelView={panelView}
        onPanelOpenChange={setPanelOpen}
        onPanelViewChange={setPanelView}
        accountOpen={accountOpen}
        onAccountOpenChange={setAccountOpen}
        accountResetKey={accountResetKey}
        groupsOpen={groupsOpen}
        onGroupsOpenChange={setGroupsOpen}
        groupsRestoreView={groupsRestoreView}
        onConsumeGroupsRestore={() => setGroupsRestoreView(null)}
        onLeaveGroupsPanel={leaveGroupsPanel}
        statusOpen={statusOpen}
        onStatusOpenChange={setStatusOpen}
        onOpenStatus={openStatus}
        onOpenGroupsTip={openGroups}
        onRequestInviteDemo={openChatInviteDemo}
        onProfileChange={(patch) => setProfile((p) => (p ? { ...p, ...patch } : p))}
        theme={theme}
        onThemeChange={setTheme}
        blockedIds={blockedIds}
      />
      {selectedCommunity && profile ? (
        <CommunityView
          me={profile}
          community={selectedCommunity}
          activeTab={communityTab}
          onTabChange={setCommunityTab}
          onCommunityUpdate={(patch) => setSelectedCommunity((c) => (c ? { ...c, ...patch } : c))}
          onDeleted={() => setSelectedCommunity(null)}
          onBack={() => {
            setSelectedCommunity(null)
            if (groupsRestoreView) setGroupsOpen(true)
          }}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />
      ) : isTauriDesktop ? null : (
        <MainPanel
          me={profile}
          conversation={selected}
          blockedIds={blockedIds}
          inviteDemoSignal={inviteDemoSignal}
          onBack={() => {
            setSelected(null)
            if (groupsRestoreView) setGroupsOpen(true)
          }}
          onConversationUpdate={(patch) => setSelected((c) => (c ? { ...c, ...patch } : c))}
          onOpenCommunity={(c) => { setSelected(null); setCommunityTab('home'); setSelectedCommunity(c) }}
          onStartCall={(peer, kind) => selected && callOverlayRef.current?.startCall({ peer, kind, conversationId: selected.id })}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />
      )}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      <CallOverlay ref={callOverlayRef} me={profile} />
    </div>
  )

  if (isTauriDesktop) {
    return (
      <div className="desktop-window-shell">
        <DesktopTitleBar title="ThothChat Messenger" />
        {appTree}
      </div>
    )
  }

  return appTree
}

export default App
