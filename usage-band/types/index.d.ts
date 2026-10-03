export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = { tokens?: number; window: number; percent?: number; limits: Limit[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snap: Snapshot | null }
  }
}
