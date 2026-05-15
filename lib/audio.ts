// Converts a Float32 sample array to 16-bit signed PCM
function float32ToPCM16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return pcm;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Captures mic audio and calls onChunk with base64 PCM at 16kHz
export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  // ScriptProcessorNode is deprecated but works for prototypes across all browsers
  private processor: ScriptProcessorNode | null = null;
  private onChunk: (base64: string) => void;

  constructor(onChunk: (base64: string) => void) {
    this.onChunk = onChunk;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
      },
      video: false,
    });
    // Request 16kHz — browsers may round to the nearest supported rate
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm = float32ToPCM16(float32);
      const base64 = arrayBufferToBase64(pcm.buffer as ArrayBuffer);
      this.onChunk(base64);
    };

    source.connect(this.processor);
    // ScriptProcessorNode must be connected to destination to fire
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    this.processor?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.processor = null;
    this.stream = null;
    this.audioContext = null;
  }
}

// Plays back base64 PCM audio at 24kHz from Gemini
export class AudioPlayer {
  private audioContext: AudioContext;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
  }

  enqueue(base64: string) {
    const buffer = base64ToArrayBuffer(base64);
    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length) as Float32Array<ArrayBuffer>;
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }
    this.scheduleChunk(float32);
  }

  private scheduleChunk(samples: Float32Array<ArrayBuffer>) {
    const audioBuffer = this.audioContext.createBuffer(1, samples.length, 24000);
    audioBuffer.copyToChannel(samples, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    this.activeSources.add(source);
    source.onended = () => this.activeSources.delete(source);

    const now = this.audioContext.currentTime;
    const startAt = Math.max(now, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + audioBuffer.duration;
  }

  // Stop all scheduled/playing audio immediately (called on model interruption)
  flush() {
    this.activeSources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    this.activeSources.clear();
    this.nextStartTime = 0;
  }

  resume() {
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
  }

  close() {
    this.flush();
    this.audioContext.close();
  }
}
