let messageAudio: HTMLAudioElement | null = null

export function playMessageSound() {
  try {
    const selected = localStorage.getItem('thoth-message-sound')
    const source = selected || `${import.meta.env.BASE_URL}sounds/notify.mp3`
    if (!messageAudio || messageAudio.src !== new URL(source, window.location.href).href) messageAudio = new Audio(source)
    messageAudio.currentTime = 0
    messageAudio.play().catch(() => {})
  } catch {
    // autoplay policy / unsupported - fail silently
  }
}
