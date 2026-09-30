const activeMessageSounds = new Set<HTMLAudioElement>()

function playSound(source: string, allowFallback: boolean) {
  const audio = new Audio(source)
  audio.preload = 'auto'
  activeMessageSounds.add(audio)

  let finished = false
  let fallbackStarted = false
  const cleanup = () => {
    if (finished) return
    finished = true
    activeMessageSounds.delete(audio)
  }
  const fallback = () => {
    if (!allowFallback || fallbackStarted) return
    fallbackStarted = true
    playSound(`${import.meta.env.BASE_URL}sounds/notify.mp3`, false)
  }
  audio.addEventListener('ended', cleanup, { once: true })
  audio.addEventListener('error', () => {
    cleanup()
    fallback()
  }, { once: true })

  audio.play().catch(() => {
    cleanup()
    fallback()
  })
}

export function playMessageSound() {
  try {
    const selected = localStorage.getItem('thoth-message-sound')
    const source = selected || `${import.meta.env.BASE_URL}sounds/notify.mp3`
    playSound(source, !!selected)
  } catch {
    // autoplay policy / unsupported - fail silently
  }
}
