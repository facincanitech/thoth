import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconArrowLeft, IconChat } from './icons'

type Props = {
  conversationId: string | null
  onBack: () => void
  children: ReactNode
}

type State = { failedFor: string | null }

export class ChatErrorBoundary extends Component<Props, State> {
  state: State = { failedFor: null }

  static getDerivedStateFromError(): State {
    return { failedFor: 'failed' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('chat render failed', error, info)
  }

  private retry = () => {
    if (this.props.conversationId) {
      try {
        localStorage.removeItem(`flux-messages:${this.props.conversationId}`)
        localStorage.removeItem(`flux-members:${this.props.conversationId}`)
      } catch {
        // O cache é opcional; continuar mesmo se o navegador bloquear o storage.
      }
    }
    this.setState({ failedFor: null })
  }

  render() {
    if (!this.state.failedFor) return this.props.children
    return (
      <main className="main chat-recovery">
        <div className="chat-recovery-card">
          <IconChat size={30} />
          <strong>Essa conversa não carregou direito.</strong>
          <span>Se algum dado temporário do navegador travar o chat, dá para limpar só o cache desta conversa e tentar novamente.</span>
          <button type="button" onClick={this.retry}>Tentar novamente</button>
          <button type="button" className="secondary" onClick={this.props.onBack}><IconArrowLeft size={16} /> Voltar às conversas</button>
        </div>
      </main>
    )
  }
}
