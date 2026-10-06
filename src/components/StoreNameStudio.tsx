import { useEffect, useState } from 'react'
import type { Profile } from '../types'
import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/errors'
import { displayName } from '../lib/displayName'
import { NAME_EFFECTS, NAME_FONTS, PRISM_PALETTES, StyledName } from './StyledName'

type NameField = 'name_style_font' | 'name_style_effect' | 'name_style_color'

export function StoreNameStudio({ me, onProfileChange, scope = 'messenger' }: { me: Profile; onProfileChange: (patch: Partial<Profile>) => void; scope?: 'messenger' | 'play' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [style, setLocalStyle] = useState({ font: me.name_style_font, effect: me.name_style_effect, color: me.name_style_color, name: displayName(me) })
  const effect = style.effect || 'solid'

  useEffect(() => {
    if (scope !== 'play') return
    supabase.from('play_profiles').select('display_name,name_style_font,name_style_effect,name_style_color').eq('user_id', me.id).maybeSingle().then(({ data }) => {
      if (!data) return
      setLocalStyle({ font: data.name_style_font, effect: data.name_style_effect, color: data.name_style_color, name: data.display_name || displayName(me) })
    })
  }, [me.id, scope])

  async function setStyle(field: NameField, value: string | null) {
    setBusy(true); setError('')
    const result = scope === 'play'
      ? await supabase.from('play_profiles').upsert({ user_id: me.id, [field]: value }, { onConflict: 'user_id' })
      : await supabase.from('profiles').update({ [field]: value }).eq('id', me.id)
    if (result.error) setError(getErrorMessage(result.error))
    else {
      const key = field === 'name_style_font' ? 'font' : field === 'name_style_effect' ? 'effect' : 'color'
      setLocalStyle((current) => ({ ...current, [key]: value }))
      onProfileChange({ [field]: value })
    }
    setBusy(false)
  }

  return <div className="store-name-studio">
    <div className="store-name-preview"><span>{scope === 'play' ? 'SEU NOME NO PLAY' : 'SEU NOME NO THOTH'}</span><StyledName name={style.name} font={style.font} effect={style.effect} color={style.color} /></div>
    <p>Combine fonte, efeito e cor. Cada escolha é salva no seu perfil e aparece para os outros.</p>
    <label>Fonte</label><div className="store-name-options">{NAME_FONTS.map((font) => <button key={font.id} className={(style.font || 'default') === font.id ? 'active' : ''} disabled={busy} onClick={() => setStyle('name_style_font', font.id === 'default' ? null : font.id)} style={{ fontFamily: font.family, fontStyle: font.id === 'arial-italic' ? 'italic' : undefined }}>{font.label}</button>)}</div>
    <label>Estilo</label><div className="store-name-options">{NAME_EFFECTS.map((item) => <button key={item.id} className={effect === item.id ? 'active' : ''} disabled={busy || item.locked} onClick={() => setStyle('name_style_effect', item.id)}>{item.label}</button>)}</div>
    <label>{effect === 'prism' ? 'Cor do prisma' : effect === 'gradient' ? 'Cor do gradiente' : 'Cor do nome'}</label>
    {effect === 'prism' ? <div className="store-name-options">{PRISM_PALETTES.map((palette) => <button key={palette.id} className={(style.color || 'rainbow') === palette.id ? 'active' : ''} disabled={busy} onClick={() => setStyle('name_style_color', palette.id === 'rainbow' ? null : palette.id)}><i style={{ background: `linear-gradient(90deg,${palette.colors.join(',')})` }} />{palette.label}</button>)}</div>
      : effect === 'gradient' ? <div className="store-name-options">{[
        ['Arco-íris', 'linear-gradient(90deg,#ff4b7d,#ffbf47,#46d997,#4b9fff,#9b5cff)'],
        ['Céu', 'linear-gradient(90deg,#28c8f7,#4265e8)'],
        ['Pôr do sol', 'linear-gradient(90deg,#ff7a39,#f72496)'],
      ].map(([label, value]) => <button key={label} className={style.color === value ? 'active' : ''} disabled={busy} onClick={() => setStyle('name_style_color', value)}><i style={{ background: value }} />{label}</button>)}</div>
        : <div className="store-name-colors"><input type="color" value={/^#[0-9a-f]{6}$/i.test(style.color || '') ? style.color! : '#47aaff'} disabled={busy} onChange={(event) => setStyle('name_style_color', event.target.value)} /><button disabled={busy} onClick={() => setStyle('name_style_color', null)}>Cor padrão</button></div>}
    {error && <div className="store-error">{error}</div>}
  </div>
}
