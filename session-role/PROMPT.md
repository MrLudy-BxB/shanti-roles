# session-role — paste this whole message into Claude Code

Copy everything below the line into a Claude Code session (desktop Code tab or terminal, version 2.1.286 or newer) and send it.

---

Build me a Claude Code mod called `session-role`. It gives each session a **Role**: a job description for the main Claude, picked from a dropdown above the chat box. Roles are markdown files in `.claude/roles/` (this project) or `~/.claude/roles/` (every project). It's already written. Please:

1. Load your `plugin-authoring` skill first.
2. Write the four files below **exactly as given** into the mods folder the skill names, under `session-role/`.
3. Run `claude plugin validate` on that folder and fix only real errors (if an event like `session.measure` or `agent.spawn` is reported as unknown, my Claude Code is older than 2.1.286 — tell me to update instead of changing the code).
4. Tell me to accept "Enable hot reloading for this session" if it asks.
5. Create `~/.claude/roles/` and ask me what my first role should be (name, what it's for, and optionally which folders it may edit), then write it as `~/.claude/roles/<name>.md` in this format:

```markdown
---
name: <name>
description: <one line, shown in /role>
edit: <optional: folders it may edit, e.g. web/**, docs/**>
tools: <optional: tool allow-list, e.g. Read, Grep, Glob>
---
<the role's instructions, written to Claude: "You are …">
```

6. Then offer to install the mod permanently by copying its folder to `~/.claude/skills/session-role/`.

### `session-role/.claude-plugin/plugin.json`

```json
{
  "name": "session-role",
  "version": "0.6.2",
  "description": "Give each session a Role: a job description for the main Claude, from .claude/roles (local) or ~/.claude/roles (global), with tool limits, an edit fence and a picker above the chat box",
  "types": "./types/index.d.ts",
  "author": {
    "name": "ShantiLink"
  },
  "skills": "./skills/"
}
```

### `session-role/hooks/hooks.json`

```json
{ "modules": ["./register.tsx"] }
```

### `session-role/types/index.d.ts`

```ts
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
```

### `session-role/hooks/register.tsx`

```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Choice, Role, Running, Scope } from '../types'

const active = atom({ plugin: 'session-role', key: 'active' } as const, null)
const choices = atom({ plugin: 'session-role', key: 'choices' } as const, [])
const running = atom({ plugin: 'session-role', key: 'running' } as const, [])
const expanded = atom({ plugin: 'session-role', key: 'expanded' } as const, [])

const PANE = 'session-role-roles'

const OFF = '__off__'
const FILE_TOOLS: Record<string, 'file_path' | 'notebook_path'> = {
  Edit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
}

type Meta = Record<string, string | string[]>
// `base`: the folder whose `.claude/roles` holds the file; the edit fence resolves project-relative globs against it.
type Found = { name: string; scope: Scope; path: string; base: string; meta: Meta; body: string }

// ---------- parsing ----------

// Front matter between --- lines: `key: value`, folded `key: >-` text, and `- item` lists.
function parse(text: string): { meta: Meta; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return { meta: {}, body: text.trim() }
  const meta: Meta = {}
  let key = ''
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) {
      key = kv[1]
      const v = kv[2].replace(/\s+#.*$/, '').trim()
      meta[key] = /^[>|][-+]?$/.test(v) ? '' : v.replace(/^["']|["']$/g, '')
    } else if (key && /^\s+-\s+/.test(line)) {
      const prev = meta[key]
      meta[key] = [...(Array.isArray(prev) ? prev : []), line.replace(/^\s+-\s+/, '').trim()]
    } else if (key && /^\s+\S/.test(line) && typeof meta[key] === 'string') {
      meta[key] = `${meta[key]} ${line.trim()}`.trim()
    }
  }
  return { meta, body: m[2].trim() }
}

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}

// A comma list or YAML list; empty, `all` or `*` means no limit (null).
function list(v: string | string[] | undefined): string[] | null {
  const items = (Array.isArray(v) ? v : (v ?? '').split(',')).map(t => t.trim()).filter(Boolean)
  return items.length === 0 || items.includes('*') || items.includes('all') ? null : items
}

function toRole(f: Found): Role {
  return {
    name: f.name,
    scope: f.scope,
    path: f.path,
    base: f.base,
    description: str(f.meta.description),
    tools: list(f.meta.tools),
    edit: list(f.meta.edit),
    agents: list(f.meta.agents),
    body: f.body,
  }
}

// ---------- matching ----------

// `Bash(git:*)` allows Bash; `mcp__github__*` allows that server's tools.
function allowsTool(tools: string[], tool: string): boolean {
  return tools.some(t => {
    const name = t.replace(/\(.*$/, '').trim()
    return name.endsWith('*') ? tool.startsWith(name.slice(0, -1)) : name === tool
  })
}

// Glob to regex: `**` any depth, `*` within a folder, `?` one character; a bare folder means everything under it.
function globToRegex(glob: string): RegExp {
  let g = glob.trim().replace(/^\.\//, '')
  if (g.endsWith('/')) g += '**'
  else if (!/[*?]/.test(g) && !/\.[^/]+$/.test(g)) g += '/**'
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*' && g[i + 1] === '*') {
      re += g[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += g[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

// Project-relative globs match inside the project root; `/…` and `~/…` globs match absolute paths anywhere.
function insideFence(edit: string[], root: string, home: string, file: string): boolean {
  const abs = file.startsWith('/') ? file : `${root}/${file.replace(/^\.\//, '')}`
  const rel = abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : null
  return edit.some(g => {
    const glob = g.trim()
    if (glob.startsWith('~/')) return globToRegex(`${home}${glob.slice(1)}`.slice(1)).test(abs.slice(1))
    if (glob.startsWith('/')) return globToRegex(glob.slice(1)).test(abs.slice(1))
    return rel !== null && globToRegex(glob).test(rel)
  })
}

// ---------- role files ----------

const ROLES_PATH = /\.claude\/roles(?![\w-])/

// Whether a tool call may have created, changed or removed a role file.
function touchesRoles(tool: string, input: Record<string, unknown>): boolean {
  if (tool === 'Bash') return typeof input.command === 'string' && ROLES_PATH.test(input.command)
  const field = FILE_TOOLS[tool]
  const file = field ? input[field] : undefined
  return typeof file === 'string' && ROLES_PATH.test(file)
}

// ---------- band ----------

const GREEN = '#3fb950'
const BLUE = '#4c8df6'

// A 10px status dot, drawn as a plain image (the interactive frame paints a box around it):
// green and gently pulsing while working where the host animates SVG images, a quiet grey ring when ready.
function statusDot(working: boolean): string {
  return working
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.5" fill="${GREEN}"><animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite"/></circle></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="none" stroke="#8888" stroke-width="1.5"/></svg>`
}

// ---------- prompt ----------

function roleSection(r: Role): string {
  const limits = [
    r.edit ? `- You may only create or edit files matching: ${r.edit.join(', ')} (paths are relative to ${r.base ?? 'the project root'} unless they start with ~/ or /). Edits elsewhere are blocked; if work is needed outside, tell the user or leave a request in a shared file.` : '',
    r.tools ? `- You may only use these tools: ${r.tools.join(', ')}. Other tool calls are blocked.` : '',
    r.agents ? `- You may only delegate to these agents: ${r.agents.join(', ')}.` : '',
  ].filter(Boolean)
  if (!r.body && limits.length === 0) {
    return `# Role: ${r.name}\n\nThis session is labelled "${r.name}" (a ${r.scope} role with no extra instructions). Work as Claude Code's default assistant.`
  }
  return `# Role: ${r.name}

For this session you are the "${r.name}" role (a ${r.scope} role, defined in ${r.path}). You are the main assistant the user is talking to: take on this role for everything in this session. Claude Code's instructions above and the project's CLAUDE.md still apply and take precedence if they conflict with the role.${limits.length ? `\n\nLimits for this role:\n${limits.join('\n')}` : ''}${r.body ? `\n\n${r.body}` : ''}`
}

// One line for the panel and the hover card: what the role may edit, use and delegate to.
function limitsLine(r: Role): string {
  return [
    `Edits: ${r.edit ? r.edit.join(', ') : 'anywhere'}`,
    `Tools: ${r.tools ? r.tools.join(', ') : 'all'}`,
    `Agents: ${r.agents ? r.agents.join(', ') : 'all'}`,
  ].join('  ·  ')
}

// ---------- engine work (top-level so the checker can follow $) ----------

let home = ''

async function homeDir($: EngineInterface): Promise<string> {
  if (home) return home
  const r = await $.process.run(['printenv', 'HOME']).catch(() => null)
  const root = $.plugin.root
  const fromRoot = root.includes('/.claude/') ? root.slice(0, root.indexOf('/.claude/')) : ''
  home = r?.exitCode === 0 && r.stdout.trim() ? r.stdout.trim() : fromRoot
  return home
}

// Every folder from the session's root up to (not including) the home folder or `/`, nearest first:
// a session opened in a subfolder still finds the roles kept at the project root, as with CLAUDE.md.
async function localBases($: EngineInterface): Promise<string[]> {
  const h = await homeDir($)
  const bases: string[] = []
  for (let d = await $.session.root(); d !== '' && d !== '/' && d !== h; d = d.slice(0, d.lastIndexOf('/'))) bases.push(d)
  return bases
}

// Local roles first (nearest folder first), so a local role overrides a global one, and a nearer one a farther one, of the same name.
async function discover($: EngineInterface): Promise<Found[]> {
  const root = await $.session.root()
  const dirs: [string, Scope, string][] = (await localBases($)).map(b => [`${b}/.claude/roles`, 'local', b])
  dirs.push([`${await homeDir($)}/.claude/roles`, 'global', root])
  const found: Found[] = []
  for (const [dir, scope, base] of dirs) {
    if (!(await $.fs.exists(dir))) continue
    const entries = (await $.fs.list(dir)).filter(f => f.name.endsWith('.md') && f.kind !== 'dir')
    for (const f of entries.sort((x, y) => x.name.localeCompare(y.name))) {
      const name = f.name.slice(0, -3)
      if (found.some(o => o.scope === scope && o.name === name)) continue
      const path = `${dir}/${f.name}`
      const parsed = parse(await $.fs.read(path).catch(() => ''))
      found.push({ name, scope, path, base, ...parsed })
    }
  }
  return found
}

async function refreshChoices($: EngineInterface): Promise<Found[]> {
  const all = await discover($)
  const next: Choice[] = all.map(f => ({
    ...toRole(f),
    isOverridden: f.scope === 'global' && all.some(o => o.scope === 'local' && o.name === f.name),
    isDefault: f.scope === 'local' && /^(true|yes)$/i.test(str(f.meta.default)),
  }))
  const now = await read($, choices)
  if (JSON.stringify(now) !== JSON.stringify(next)) await update($, choices, () => next)
  return all
}

async function remember($: EngineInterface, r: Role | null): Promise<void> {
  const key = `role-by-session:${await $.session.id()}`
  if (r === null) await $.store.delete(key)
  else await $.store.set(key, { name: r.name, scope: r.scope })
}

// Switches the session's role (or off); says whether it switched and what to tell the person.
async function switchRole($: EngineInterface, arg: string): Promise<{ ok: boolean; text: string }> {
  const cur = await read($, active)
  if (arg === 'off' || arg === 'none' || arg === OFF) {
    if (cur === null) return { ok: true, text: 'No role was active.' }
    await update($, active, () => null)
    await remember($, null)
    await addMarker($, `— Role switched: ${cur.name} → No role. From here on, act as Claude Code's default assistant. —`)
    return { ok: true, text: `Role ${cur.name} is off. This session has no role now.` }
  }

  const all = await refreshChoices($)
  const [name, scope] = arg.split('@')
  const hit =
    all.find(f => f.name === name && (scope === undefined || f.scope === scope)) ??
    all.find(f => str(f.meta.name) === name && (scope === undefined || f.scope === scope))
  if (!hit) return { ok: false, text: `No role named "${name}". Run /role to see the list.` }

  const role = toRole(hit)
  await update($, active, () => role)
  await remember($, role)
  await addMarker($, `— Role switched: ${cur ? cur.name : 'No role'} → ${role.name}. From here on, follow this role: —\n\n${roleSection(role)}`)

  const notes = [
    role.edit ? `Edits limited to: ${role.edit.join(', ')}.` : 'May edit anywhere.',
    role.tools ? `Tools limited to: ${role.tools.join(', ')}.` : 'All tools allowed.',
    role.agents ? `Agents offered: ${role.agents.join(', ')}.` : '',
    'Earlier messages stay in context; start a new session for a clean slate.',
  ].filter(Boolean)
  return { ok: true, text: `This session now has the ${role.scope} role "${role.name}".\n${notes.join('\n')}` }
}

// A note in the conversation so the model sees exactly when the role changed.
async function addMarker($: EngineInterface, text: string): Promise<void> {
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }).catch(() => undefined)
}

// Restores this session's saved role, else the project's default; no marker (nothing changed mid-conversation).
async function restore($: EngineInterface): Promise<void> {
  const all = await refreshChoices($)
  const saved = (await $.store.get(`role-by-session:${await $.session.id()}`)) as { name?: string; scope?: Scope } | undefined
  const hit =
    (saved?.name && all.find(f => f.name === saved.name && f.scope === saved.scope)) ||
    all.find(f => f.scope === 'local' && /^(true|yes)$/i.test(str(f.meta.default)))
  if (hit) {
    const role = toRole(hit)
    await update($, active, () => role)
    await remember($, role)
    // A resumed session already has its switch note; a fresh one starting on the default role needs the text.
    if (!saved?.name) await addMarker($, `— This project starts sessions in the ${role.name} role. Follow this role: —\n\n${roleSection(role)}`)
  }
}

// Drops entries whose subagent the engine no longer lists as running.
async function prune($: EngineInterface): Promise<void> {
  const agents = await $.agent.list().catch(() => null)
  if (agents === null) return
  const live = new Set(agents.filter(a => a.status === 'running').map(a => a.id))
  await finish($, r => !live.has(r.id))
}

async function finish($: EngineInterface, gone: (r: Running) => boolean): Promise<void> {
  const now = await read($, running)
  if (now.some(gone)) await update($, running, l => l.filter(r => !gone(r)))
}

function listing(all: Found[], cur: Role | null, root: string): string {
  const lines: string[] = []
  const groups: [string, Found[]][] = []
  for (const f of all.filter(f => f.scope === 'local')) {
    const g = groups.find(([b]) => b === f.base)
    if (g) g[1].push(f)
    else groups.push([f.base, [f]])
  }
  if (groups.length === 0) lines.push('Local roles (.claude/roles): none')
  for (const [base, group] of groups) {
    lines.push(`Local roles (${base === root ? '.claude/roles' : `${base}/.claude/roles`})`)
    for (const f of group) lines.push(row(f, all, cur))
  }
  const globals = all.filter(f => f.scope === 'global')
  lines.push(`Global roles (~/.claude/roles)${globals.length ? '' : ': none'}`)
  for (const f of globals) lines.push(row(f, all, cur))
  if (!all.some(f => f.scope === 'local' && /^(true|yes)$/i.test(str(f.meta.default)))) lines.push('', 'No role is the default here: no role has `default: true`.')
  lines.push('', cur ? `Active: ${cur.name} (${cur.scope}). /role off for no role.` : 'No role active. /role <name> to pick one.')
  return lines.join('\n')
}

function row(f: Found, all: Found[], cur: Role | null): string {
  const mark = cur?.name === f.name && cur.scope === f.scope ? '●' : '○'
  const tags = [
    f.scope === 'global' && all.some(o => o.scope === 'local' && o.name === f.name) ? 'overridden by local' : '',
    f.scope === 'local' && /^(true|yes)$/i.test(str(f.meta.default)) ? 'default' : '',
  ].filter(Boolean)
  const desc = str(f.meta.description).replace(/\s+/g, ' ')
  return `  ${mark} ${f.name}${tags.length ? ` (${tags.join(', ')})` : ''}${desc ? ` — ${desc.length > 90 ? `${desc.slice(0, 89)}…` : desc}` : ''}`
}

// The Roles panel: every role with its description, limits and full prompt; `name` opens that one's prompt.
async function openPanel($: EngineInterface, name?: string): Promise<void> {
  const all = await refreshChoices($)
  const hit = name ? all.find(f => f.name === name.split('@')[0] && (!name.includes('@') || f.scope === name.split('@')[1])) : undefined
  if (hit) await update($, expanded, l => (l.includes(`${hit.name}@${hit.scope}`) ? l : [...l, `${hit.name}@${hit.scope}`]))
  await $.ui.open({ id: PANE, title: 'Roles', closeOnEscape: true })
}

// The band's ↻ (key `refresh`): re-read the role folders and the subagent list. usage-band hooks the same press
// (ui.press, plugin `session-role`, element `refresh`) to re-measure its figures, so one button refreshes the band.
async function refreshAll($: EngineInterface): Promise<void> {
  await refreshChoices($).catch(() => undefined)
  await prune($)
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'role',
      description: 'Give this session a role: /role lists, /role show [name] opens the Roles panel, /role <name> [task] switches (and starts the task), /role off for no role',
    })
    await restore($).catch(() => undefined)
    // Roles added by another session, an editor or Finder show up within half a minute.
    $.clock.every(30_000, () => void refreshChoices($).catch(() => undefined))
    return started
  })

  // Compaction can summarise the switch note away; hand the role over again afterwards.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    const r = await read($, active)
    if (r !== null) await addMarker($, `— Role still active after compaction: ${r.name}. Keep following this role: —\n\n${roleSection(r)}`)
    return compacted
  })

  // `/role <name> <task>` switches, then sends the task as the person's first message in that role.
  on('command.run', { command: 'role' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') return { text: listing(await refreshChoices($), await read($, active), await $.session.root()) }
    if (arg === 'show' || arg.startsWith('show ')) {
      const name = arg.slice(4).trim()
      await openPanel($, name || undefined)
      return { text: name ? `Roles panel opened at ${name}.` : 'Roles panel opened: descriptions, limits and full prompts of every role.' }
    }

    const target = arg.split(/\s+/)[0]
    const task = arg.slice(target.length).trim()
    const switched = await switchRole($, target)
    if (!switched.ok || task === '') return { text: switched.text }

    void $.prompt.submit({ text: task, asUser: true })
    return { text: `${switched.text}\nStarting: ${task}` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const r = await read($, active)
    if (r === null || e.traits.includes('teammate')) return composed
    return { sections: [...composed.sections, { id: 'session-role:role', scope: 'session' as const, text: roleSection(r) }] }
  })

  // Tool allow-list and edit fence (main conversation only; subagents keep their own rules),
  // then: a role file written mid-session, by any loop, shows up in the picker at once.
  on('tool.call', async ($, e, next) => {
    const r = e.agentId === undefined ? await read($, active) : null
    if (r) {
      if (r.tools !== null && !allowsTool(r.tools, e.tool)) {
        return { deny: `The "${r.name}" role may not use ${e.tool} (its tools: ${r.tools.join(', ')}). The user can run /role off to lift this.` }
      }
      const field = FILE_TOOLS[e.tool]
      const file = field ? (e as unknown as Record<string, unknown>)[field] : undefined
      if (r.edit !== null && typeof file === 'string' && !insideFence(r.edit, r.base ?? (await $.session.root()), await homeDir($), file)) {
        return { deny: `The "${r.name}" role may only edit ${r.edit.join(', ')}; ${file} is outside that. Tell the user what change is needed there instead.` }
      }
    }

    const ran = await next(e)
    if (touchesRoles(e.tool, e as unknown as Record<string, unknown>)) await refreshChoices($).catch(() => undefined)
    return ran
  })

  on('agent.offer', async ($, e, next) => {
    const r = await read($, active)
    if (r?.agents && !r.agents.includes(e.agent)) return { isOffered: false }
    return next(e)
  })

  // Subagents, from the moment they start until their call or loop ends.
  on('agent.spawn', async ($, e, next) => {
    // `agents:` also refuses a dispatch by name, not just the listing.
    const r = e.parentAgentId === undefined ? await read($, active) : null
    if (r?.agents && !r.agents.includes(e.subagentType)) {
      return { deny: `The "${r.name}" role may only delegate to: ${r.agents.join(', ')}.` }
    }
    const started = await next(e)
    if (!started.deny && started.agentId) {
      const entry: Running = { id: started.agentId, type: e.subagentType, toolUseId: e.tool_use_id }
      await update($, running, l => [...l, entry])
    }
    return started
  })

  // `finally`: an interrupted or failed Agent call must not leave a stale ↳ entry behind.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      if (!e.run_in_background) await finish($, r => r.toolUseId === e.tool_use_id)
    }
  })

  on('turn.complete', async ($, e, next) => {
    try {
      return await next(e)
    } finally {
      if (e.agentId !== undefined) await finish($, r => r.id === e.agentId)
      // When the main turn ends, nothing it started in the foreground can still be running;
      // also pick up role files added any other way (Finder, another session, an editor).
      else {
        await prune($)
        await refreshChoices($).catch(() => undefined)
      }
    }
  })

  // After every main-thread turn (the engine measures then), pick up role files added elsewhere.
  on('session.measure', async ($, e, next) => {
    const measured = await next(e)
    await refreshChoices($).catch(() => undefined)
    return measured
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const r = await read($, active)
    const list = await read($, choices)
    const subs = await read($, running)

    const { Box, Text, Select, Svg, Button } = $.ui.resolve(e) as any
    const value = r === null ? OFF : `${r.name}@${r.scope}`
    const options = [
      // With no role marked `default: true`, new sessions start on No role, so it carries the tag.
      { key: OFF, value: OFF, label: list.some(c => c.isDefault) ? 'No role' : 'No role (default)' },
      ...list.map(c => {
        const isTwin = list.some(o => o.name === c.name && o.scope !== c.scope)
        return {
          key: `${c.name}@${c.scope}`,
          value: `${c.name}@${c.scope}`,
          label: `${c.name}${isTwin ? ` (${c.scope})` : ''}${c.isDefault ? ' (default)' : ''}`,
        }
      }),
    ]
    const refresh = async () => {
      await refreshAll($)
      $.ui.toast('Band refreshed')
    }
    const pick = async (v: string) => {
      const switched = await switchRole($, v)
      $.ui.toast(switched.text.split('\n')[0])
    }

    // Running subagents, grouped by type: "Explore ×2 · general-purpose".
    const counts = new Map<string, number>()
    for (const s of subs) counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
    const subText = [...counts].map(([type, n]) => `${type}${n > 1 ? ` ×${n}` : ''}`).join(' · ')

    const working = e.props.isWorking
    // The active role's one-line description, cut to fit beside the picker.
    const room = Math.max(20, Math.floor((e.props.bodyColumns ?? 100) / 2.5))
    const desc = (r?.description ?? '').replace(/\s+/g, ' ')
    const about = desc.length > room ? `${desc.slice(0, room - 1)}…` : desc
    const dot = Svg ? (
      <Svg
        key="status-dot"
        source={statusDot(working)}
        alt={working ? 'Working' : 'Ready'}
        width={10}
        height={10}
      />
    ) : (
      <Text color={working ? GREEN : undefined} dimColor={!working}>{working ? '●' : '○'}</Text>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={3} paddingX={1} flexWrap="wrap">
          <Box flexDirection="row" alignItems="center" columnGap={2}>
            <Box flexDirection="row" alignItems="center" gap={1}>
              <Text dimColor>Role</Text>
              {Select ? (
                <Select key="role-pick" options={options} value={value} onSelect={pick} />
              ) : (
                <Text bold>{r ? r.name : 'No role'}</Text>
              )}
              {Button ? <Button key="roles-info" label="ⓘ" plain dimColor onPress={() => void openPanel($, r ? `${r.name}@${r.scope}` : undefined)} /> : null}
            </Box>
            <Box flexDirection="row" alignItems="center" gap={1}>
              {dot}
              <Text color={working ? GREEN : undefined} dimColor={!working}>{working ? 'Working' : 'Ready'}</Text>
            </Box>
            {about ? <Text dimColor>{about}</Text> : null}
          </Box>
          <Box flexDirection="row" alignItems="center" columnGap={2}>
            {subText ? (
              <Box flexDirection="row" alignItems="center" gap={1}>
                <Text dimColor>Subagents</Text>
                <Text color={BLUE}>{subText}</Text>
              </Box>
            ) : null}
            {Button ? <Button key="refresh" label="↻" plain dimColor onPress={refresh} /> : null}
          </Box>
        </Box>
        {below}
      </Box>
    )
  })

  // The Roles panel: read any role before picking it.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e) as any
    const r = await read($, active)
    const list = await read($, choices)
    const open = await read($, expanded)
    const use = async (v: string) => {
      const switched = await switchRole($, v)
      $.ui.toast(switched.text.split('\n')[0])
    }
    const toggle = (k: string) => update($, expanded, l => (l.includes(k) ? l.filter(x => x !== k) : [...l, k]))

    const card = (c: Choice) => {
      const k = `${c.name}@${c.scope}`
      const isActive = r !== null && r.name === c.name && r.scope === c.scope
      const isOpen = open.includes(k)
      const tags = [c.scope, c.isDefault ? 'default' : '', c.isOverridden ? 'overridden by local' : ''].filter(Boolean).join(' · ')
      return (
        <Box key={`card:${k}`} flexDirection="column" borderStyle="round" borderColor={isActive ? GREEN : undefined} borderDimColor={!isActive} paddingX={1} marginBottom={1}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2} flexWrap="wrap">
            <Box flexDirection="row" alignItems="center" gap={1}>
              <Text bold>{c.name}</Text>
              <Text dimColor>{tags}</Text>
              {isActive ? <Text color={GREEN}>● active</Text> : null}
            </Box>
            <Box flexDirection="row" alignItems="center" columnGap={2}>
              <Button key={`prompt:${k}`} label={isOpen ? 'Hide prompt' : 'Show prompt'} plain dimColor onPress={() => void toggle(k)} />
              {isActive ? null : <Button key={`use:${k}`} label="Use" variant="primary" onPress={() => void use(k)} />}
            </Box>
          </Box>
          <Text>{c.description || 'No description.'}</Text>
          <Text dimColor>{limitsLine(c)}</Text>
          {isOpen ? (
            Markdown ? <Markdown key={`md:${k}`} text={roleSection(c).slice(0, 9999)} /> : <Text>{roleSection(c)}</Text>
          ) : null}
          <Text dimColor>{c.path}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box key="card:off" flexDirection="column" borderStyle="round" borderColor={r === null ? GREEN : undefined} borderDimColor={r !== null} paddingX={1} marginBottom={1}>
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={2}>
            <Box flexDirection="row" alignItems="center" gap={1}>
              <Text bold>No role</Text>
              {list.some(c => c.isDefault) ? null : <Text dimColor>default</Text>}
              {r === null ? <Text color={GREEN}>● active</Text> : null}
            </Box>
            {r === null ? null : <Button key="use:off" label="Use" onPress={() => void use(OFF)} />}
          </Box>
          <Text dimColor>Claude Code's default assistant: no role instructions or limits.</Text>
        </Box>
        {list.length === 0 ? <Text dimColor>No roles yet. Ask Claude to create one, or add a file to .claude/roles/.</Text> : null}
        {list.map(card)}
      </Box>
    )
  })
}
```
