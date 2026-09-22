import { IconChat, IconDownload, IconArrowLeft } from './icons'
import { inviteDeepLink } from '../lib/inviteLink'
import { APK_DOWNLOAD_URL, DESKTOP_DOWNLOAD_URL } from '../version'

type Props = {
  kind: 'invite' | 'play'
  code: string
  onContinueInBrowser: () => void
}

// Tela mostrada quando alguem abre um link de convite (?invite=/?play=) direto no navegador,
// fora do app instalado. Deixa a pessoa escolher onde abrir, em vez de cair direto na versao web -
// clicar em "Abrir no app" tenta o protocolo thoth:// (registrado pelo instalador do desktop e
// pelo AndroidManifest); se o app nao estiver instalado o navegador so ignora, sem erro visivel,
// entao sempre mostramos tambem o link de baixar e a opcao de continuar no navegador.
export function InviteChooser({ kind, code, onContinueInBrowser }: Props) {
  const link = inviteDeepLink(kind, code)
  const title = kind === 'play' ? 'Convite pro servidor no Thoth Play' : 'Convite pro Thoth Messenger'

  return (
    <div className="invite-chooser">
      <div className="invite-chooser-card">
        <div className="invite-chooser-icon"><IconChat size={28} /></div>
        <h1>{title}</h1>
        <p>Onde você quer abrir?</p>

        <div className="invite-chooser-options">
          <a className="invite-chooser-option" href={link}>
            <strong>Abrir no app do Windows</strong>
            <span>Se o Thoth Messenger já estiver instalado, abre por lá</span>
          </a>
          <a className="invite-chooser-option" href={link}>
            <strong>Abrir no app do celular</strong>
            <span>Se o app Android já estiver instalado, abre por lá</span>
          </a>
          <button type="button" className="invite-chooser-option" onClick={onContinueInBrowser}>
            <strong>Continuar no navegador</strong>
            <span>Usar o Thoth Messenger direto aqui, sem instalar nada</span>
          </button>
        </div>

        <div className="invite-chooser-downloads">
          <span>Ainda não tem o app?</span>
          <div>
            <a href={DESKTOP_DOWNLOAD_URL}><IconDownload size={14} /> Baixar pra Windows</a>
            <a href={APK_DOWNLOAD_URL}><IconDownload size={14} /> Baixar o APK</a>
          </div>
        </div>

        <button type="button" className="invite-chooser-back" onClick={onContinueInBrowser}>
          <IconArrowLeft size={14} /> ver no navegador mesmo assim
        </button>
      </div>
    </div>
  )
}
