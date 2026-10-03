export type Scope = 'local' | 'global'

export type Role = {
  name: string
  scope: Scope
  path: string
  /** The folder holding this role's `.claude/roles` (the session's root for a global role); `edit:` globs resolve against it. Absent on a role saved by 0.3.1 or earlier. */
  base?: string
  description: string
  /** Tool allow-list; null means every tool. */
  tools: string[] | null
  /** Globs (relative to `base`) the role may write; null means anywhere. */
  edit: string[] | null
  /** Agents offered to the session; null means all. */
  agents: string[] | null
  body: string
}

/** One role the session can pick: the parsed file, for the picker and the Roles panel. */
export type Choice = Role & { isOverridden: boolean; isDefault: boolean }

/** A subagent running now: its loop id, its type, and the Agent call that started it. */
export type Running = { id: string; type: string; toolUseId: string }

declare module 'claude-code' {
  interface PluginState {
    'session-role': {
      active: Role | null
      choices: Choice[]
      running: Running[]
      /** Roles whose full prompt the Roles panel shows (`name@scope`). */
      expanded: string[]
    }
  }
}
