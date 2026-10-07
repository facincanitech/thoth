import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import { Track, type AudioProcessorOptions, type TrackProcessor } from 'livekit-client'

let binaryPromise: Promise<ArrayBuffer> | null = null
const initializedContexts = new WeakSet<AudioContext>()

function loadBinary() {
  binaryPromise ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl })
  return binaryPromise
}

export class ThothRnnoiseProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'thoth-rnnoise'
  processedTrack?: MediaStreamTrack
  analysisNode?: AudioNode
  private source?: MediaStreamAudioSourceNode
  private suppressor?: RnnoiseWorkletNode
  private gain?: GainNode
  private destination?: MediaStreamAudioDestinationNode
  private readonly inputVolume: number
  private readonly suppressNoise: boolean

  constructor(inputVolume: number, suppressNoise = true) {
    this.inputVolume = inputVolume
    this.suppressNoise = suppressNoise
  }

  async init(options: AudioProcessorOptions) { await this.setup(options) }
  async restart(options: AudioProcessorOptions) { this.disconnect(); await this.setup(options) }
  async destroy() { this.disconnect() }

  private async setup({ audioContext, track }: AudioProcessorOptions) {
    if (audioContext.state === 'suspended') await audioContext.resume()
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]))
    this.gain = audioContext.createGain()
    this.gain.gain.value = this.inputVolume
    this.destination = audioContext.createMediaStreamDestination()
    if (this.suppressNoise) {
      if (!audioContext.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('RNNoise nao e suportado neste dispositivo')
      const wasmBinary = await loadBinary()
      if (!initializedContexts.has(audioContext)) {
        await audioContext.audioWorklet.addModule(rnnoiseWorkletUrl)
        initializedContexts.add(audioContext)
      }
      this.suppressor = new RnnoiseWorkletNode(audioContext, { wasmBinary, maxChannels: 1 })
      this.source.connect(this.suppressor)
      this.suppressor.connect(this.gain)
    } else {
      this.source.connect(this.gain)
    }
    this.gain.connect(this.destination)
    this.analysisNode = this.gain
    this.processedTrack = this.destination.stream.getAudioTracks()[0]
  }

  private disconnect() {
    try { this.source?.disconnect() } catch { /* already disconnected */ }
    try { this.suppressor?.disconnect() } catch { /* already disconnected */ }
    try { this.gain?.disconnect() } catch { /* already disconnected */ }
    try { this.suppressor?.destroy() } catch { /* already destroyed */ }
    this.processedTrack?.stop()
    this.source = undefined
    this.suppressor = undefined
    this.gain = undefined
    this.destination = undefined
    this.analysisNode = undefined
    this.processedTrack = undefined
  }
}
