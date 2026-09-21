import { useEffect } from 'react'
import { supabase } from './supabase'

const ACTIVITY_KEY = 'thoth-last-activity'
const IDLE_THRESHOLD_MS = 120000

function readSharedActivity(): number {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0 } catch { return 0 }
}

// Presenca (online/afk): grava last_seen_at a cada 30s. Roda em toda janela que estiver aberta (principal e
// Thoth Play) - se so a janela principal fizesse isso, com ela escondida na bandeja o WebView pausa o timer e
// a pessoa aparecia offline com o Play aberto. A atividade (mouse/teclado) e compartilhada entre as janelas.
export function useHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    let last = Date.now()
    let lastWrite = 0
    function markActive() {
      last = Date.now()
      if (last - lastWrite > 5000) {
        lastWrite = last
        try { localStorage.setItem(ACTIVITY_KEY, String(last)) } catch { /* ignore */ }
      }
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }))
    const heartbeat = () => {
      const lastActivity = Math.max(last, readSharedActivity())
      const isIdle = Date.now() - lastActivity > IDLE_THRESHOLD_MS
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString(), is_idle: isIdle }).eq('id', userId).then()
    }
    heartbeat()
    const interval = setInterval(heartbeat, 30000)
    document.addEventListener('visibilitychange', heartbeat)
    return () => {
      clearInterval(interval)
      events.forEach((ev) => window.removeEventListener(ev, markActive))
      document.removeEventListener('visibilitychange', heartbeat)
    }
  }, [userId])
}
