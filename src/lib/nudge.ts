let nudgeAudio: HTMLAudioElement | null = null

export function playNudgeSound() {
  try {
    const selected = localStorage.getItem('thoth-nudge-sound')
    if (!nudgeAudio || (selected && nudgeAudio.src !== selected)) nudgeAudio = new Audio(selected || `${import.meta.env.BASE_URL}sounds/nudge.mp3`)
    nudgeAudio.currentTime = 0
    nudgeAudio.play().catch(() => {})
  } catch {
    // audio not available (autoplay policy, unsupported browser) — fail silently
  }
}

export function triggerNudgeShake() {
  const el = document.querySelector('.app')
  if (!el) return
  el.classList.remove('nudging')
  // force reflow so the animation restarts if triggered twice in a row
  void (el as HTMLElement).offsetWidth
  el.classList.add('nudging')
  setTimeout(() => el.classList.remove('nudging'), 500)
}
