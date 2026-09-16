// Types for signalsmith-stretch 1.3 (MIT), which ships JavaScript only.
// API: https://signalsmith-audio.co.uk/code/stretch/ (README in the package).
declare module "signalsmith-stretch" {
  export type StretchChange = {
    /** Audio-context time the change is heard at; the node compensates for its own latency. */
    output?: number;
    active?: boolean;
    /** Position in the node's input buffer, in seconds. */
    input?: number;
    /** Playback speed, e.g. 0.9. Pitch is kept. */
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  };

  export interface StretchNode extends AudioWorkletNode {
    inputTime: number;
    schedule(change: StretchChange, adjustPrevious?: boolean): Promise<unknown>;
    start(when?: number): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    /** Appends one typed array per channel; the optional second argument is a transfer list. Resolves to the new buffer end in seconds. */
    addBuffers(buffers: Float32Array[], transfer?: Transferable[]): Promise<number>;
    /** No argument: drop everything and reset the end to 0. With seconds: drop what lies before, keep the end. */
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number }>;
    latency(): Promise<number>;
    configure(config: { blockMs?: number; intervalMs?: number; splitComputation?: boolean; preset?: "default" | "cheaper" }): Promise<unknown>;
    setUpdateInterval(seconds: number, callback?: (inputTime: number) => void): Promise<unknown>;
  }

  export default function SignalsmithStretch(context: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>;
}
