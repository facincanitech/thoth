let messageAudio: HTMLAudioElement | null = null

export function playMessageSound() {
  try {
    const selected = localStorage.getItem('thoth-message-sound')
    if (!messageAudio || (selected && messageAudio.src !== selected)) messageAudio = new Audio(selected || `${import.meta.env.BASE_URL}sounds/notify.mp3`)
    messageAudio.currentTime = 0
    messageAudio.play().catch(() => {})
  } catch {
    // autoplay policy / unsupported - fail silently
  }
}
