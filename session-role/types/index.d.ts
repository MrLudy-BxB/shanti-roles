export type Scope = 'local' | 'global'

export type Role = {
  name: string
  scope: Scope
  path: string
  description: string
  /** Tool allow-list; null means every tool. */
  tools: string[] | null
  /** Globs (relative to the project root) the role may write; null means anywhere. */
  edit: string[] | null
  /** Agents offered to the session; null means all. */
  agents: string[] | null
  body: string
}

/** One entry of the band's picker. */
export type Choice = { name: string; scope: Scope; isOverridden: boolean; isDefault: boolean }

/** A subagent running now: its loop id, its type, and the Agent call that started it. */
export type Running = { id: string; type: string; toolUseId: string }

declare module 'claude-code' {
  interface PluginState {
    'session-role': {
      active: Role | null
      choices: Choice[]
      running: Running[]
    }
  }
}
