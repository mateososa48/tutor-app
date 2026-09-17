// `ws` rides in as a transitive dependency and ships no types. Only
// scripts/live-model-probe.ts uses it (Node has no WebSocket on 20.x), so
// this covers just the surface that script touches.
declare module "ws" {
  export default class WebSocket {
    constructor(address: string, options?: Record<string, unknown>);
    send(data: string | Buffer): void;
    close(code?: number, reason?: string): void;
    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: Buffer) => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
  }
}
