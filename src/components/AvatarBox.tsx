import { useEffect, useState } from 'react'
import { colorFromId } from '../lib/avatarColor'
import type { ProfileCosmetic } from '../types'
import { resolveAssetUrl } from '../lib/assetUrl'

type Props = {
  src: string | null | undefined
  id: string
  fallbackLetter: string
  className?: string
  style?: React.CSSProperties
  lazy?: boolean
  frame?: ProfileCosmetic | null
  onClick?: () => void
}

export function AvatarBox({ src, id, fallbackLetter, className, style, lazy, frame, onClick }: Props) {
  const [failed, setFailed] = useState(false)
  const [frameFailed, setFrameFailed] = useState(false)
  // Moldura GIF segue a mesma regra das placas: estatica por padrao (preview_url, extraida na
  // criacao) e so anima de verdade (asset_url) com o mouse em cima - sem isso a moldura ficava
  // sempre travada no quadro estatico (quando a arte antiga nao tinha preview_url gerado) ou
  // sempre animando (mostrando sempre o asset_url cru, ignorando a regra de so-no-hover).
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  useEffect(() => {
    setFrameFailed(false)
  }, [frame?.asset_url])

  const showImage = !!src && !failed
  const frameAnimated = frame?.animated === true
  const frameStaticUrl = resolveAssetUrl(frame?.preview_url || frame?.asset_url)
  const frameAnimatedUrl = resolveAssetUrl(frame?.asset_url)
  const frameUrl = (frameAnimated && hovered ? frameAnimatedUrl : frameStaticUrl) || frameAnimatedUrl

  return (
    // O hover fica no container, nao na propria img da moldura: .avatar-frame-decoration tem
    // pointer-events:none (de proposito, pra clique/drag atravessar ela e chegar na foto) - um
    // onMouseEnter nela mesma nunca dispararia.
    <div className={`${className || ''}${frameUrl && !frameFailed ? ' avatar-has-frame' : ''}`} style={showImage ? style : { ...style, background: colorFromId(id), color: '#fff' }} onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {showImage ? <img src={src!} alt="" loading={lazy ? 'lazy' : undefined} decoding="async" onError={() => setFailed(true)} /> : fallbackLetter}
      {frameUrl && !frameFailed && <img className="avatar-frame-decoration" src={frameUrl} alt="" aria-hidden="true" onError={() => setFrameFailed(true)} style={frame?.position ? { objectPosition: frame.position } : undefined} />}
    </div>
  )
}
