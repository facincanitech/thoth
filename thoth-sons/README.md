# Sons originais do Thoth Messenger

Gerados do zero para o projeto, sem samples ou arquivos de terceiros.

## Mensagem

- `mensagem-01-luzes.wav`: tres notas ascendentes, clara e moderna.
- `mensagem-02-orbita.wav`: assinatura curta de duas notas.
- `mensagem-03-portal.wav`: arpejo nostalgico um pouco mais musical.
- `mensagem-04-cyberpunk.wav`: duas notas metalicas curtas com pulso grave.

## Chamar atencao

- `atencao-01-pulso.wav`: quatro impactos digitais.
- `atencao-02-sinal.wav`: tres rajadas de sirene sintetica.
- `atencao-03-thoth.wav`: duas batidas graves com resposta brilhante.

Os arquivos sao PCM mono, 44.1 kHz, 16 bits. Para gerar novamente ou ajustar os sons:

```text
node thoth-sons/generate-sounds.mjs
```

Nenhum deles substitui automaticamente `public/sounds/notify.mp3` ou `public/sounds/nudge.mp3`.
