# usage-band — paste this whole message into Claude Code

Copy everything below the line into a Claude Code session (desktop Code tab or terminal, version 2.1.286 or newer) and send it.

---

Build me a Claude Code mod called `usage-band`: an always-visible line above the chat box showing context-window fill and my plan usage limits (5-hour session and weekly, with reset times) as small bars. It's already written. Please:

1. Load your `plugin-authoring` skill first.
2. Write the four files below **exactly as given** into the mods folder the skill names, under `usage-band/`.
3. Run `claude plugin validate` on that folder and fix only real errors (if `session.measure` is reported as unknown, my Claude Code is older than 2.1.286 — tell me to update instead of changing the code).
4. Tell me to accept "Enable hot reloading for this session" if it asks. The band appears after your next reply.
5. Then offer to install it permanently by copying the folder to `~/.claude/skills/usage-band/`.

### `usage-band/.claude-plugin/plugin.json`

```json
{
  "name": "usage-band",
  "version": "0.3.0",
  "description": "Always-visible band above the prompt: context window fill and plan usage limits",
  "types": "./types/index.d.ts",
  "author": {
    "name": "ShantiLink"
  }
}
```

### `usage-band/hooks/hooks.json`

```json
{ "modules": ["./register.tsx"] }
```

### `usage-band/types/index.d.ts`

```ts
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = { tokens?: number; window: number; percent?: number; limits: Limit[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { snap: Snapshot | null }
  }
}
```

### `usage-band/hooks/register.tsx`

```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Snapshot } from '../types'

const snap = atom({ plugin: 'usage-band', key: 'snap' } as const, null)

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function tokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`
  return `${n}`
}

function label(kind: string): string {
  if (kind === 'five_hour') return 'Session'
  if (kind === 'seven_day') return 'Week'
  if (kind === 'spend_limit') return 'Spend'
  if (kind.startsWith('seven_day_')) {
    const model = kind.slice('seven_day_'.length)
    return `Week · ${model[0].toUpperCase()}${model.slice(1)}`
  }
  return kind
}

function resets(limit: Limit): string {
  if (!limit.resetsAt) return ''
  const d = new Date(limit.resetsAt)
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  return limit.kind === 'five_hour' ? `↻ ${time}` : `↻ ${DAYS[d.getDay()]} ${time}`
}

// Blue, amber from 80%, red from 90%: the bar and its number share the colour.
function tone(percent: number): string {
  return percent >= 90 ? '#e5484d' : percent >= 80 ? '#f5a524' : '#4c8df6'
}

// A 36×4 rounded track with a fill in the percentage's tone.
function bar(percent: number): string {
  const p = Math.max(0, Math.min(100, percent))
  const fill = tone(p)
  const w = p === 0 ? 0 : Math.max(2, (36 * p) / 100)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="4" viewBox="0 0 36 4"><rect width="36" height="4" rx="2" fill="#8888" opacity="0.35"/><rect width="${w}" height="4" rx="2" fill="${fill}"/></svg>`
}

// Re-reads the figures, with the context estimated from the conversation as it is now (right straight
// after a compaction, when the engine's figure is still the last reply's).
async function remeasure($: EngineInterface): Promise<void> {
  const u = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  if (u === null) return
  const total = u.context.breakdown?.totalTokens
  const s: Snapshot =
    total === undefined
      ? { tokens: u.context.tokens, window: u.context.window, percent: u.context.percent, limits: u.rateLimits }
      : { tokens: total, window: u.context.window, percent: Math.round((100 * total) / u.context.window), limits: u.rateLimits }
  await update($, snap, () => s)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const u = await $.session.usage()
    const s: Snapshot = { ...u.context, limits: u.rateLimits }
    await update($, snap, () => s)
    return result
  })

  // The engine's figure is the last response's input, so straight after a compaction it still reads the old size
  // until the next reply; show the compacted size at once.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    const after = 'tokensAfter' in compacted ? compacted.tokensAfter : undefined
    const s = await read($, snap)
    if (e.trigger !== 'precompute' && after !== undefined && s !== null) {
      await update($, snap, () => ({ ...s, tokens: after, percent: Math.round((100 * after) / s.window) }))
    }
    return compacted
  })

  // The ↻ that session-role draws in the band refreshes these figures too.
  on('ui.press', { plugin: 'session-role', element: 'refresh' }, async ($, e, next) => {
    const pressed = await next(e)
    await remeasure($)
    return pressed
  })

  on('session.measure', async ($, e, next) => {
    const s: Snapshot = { ...e.context, limits: e.rateLimits }
    await update($, snap, () => s)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Draw whatever other mods put here too, below this line.
    const below = await next(e)
    const s = await read($, snap)
    if (e.props.hasSurvey || s === null) return below

    const { Box, Text, Svg } = $.ui.resolve(e) as any
    const hasSvg = Svg !== undefined

    const cell = (key: string, name: string, percent: number, detail: string) => (
      <Box key={key} flexDirection="row" alignItems="center" gap={1}>
        <Text dimColor>{name}</Text>
        {hasSvg ? <Svg source={bar(percent)} alt={`${name} ${percent}%`} width={36} height={4} /> : null}
        <Text bold={percent >= 80} color={percent >= 80 ? tone(percent) : undefined}>{`${percent}%`}</Text>
        {detail ? <Text dimColor>{detail}</Text> : null}
      </Box>
    )

    const ctxDetail = s.tokens === undefined ? `of ${tokens(s.window)}` : `${tokens(s.tokens)} / ${tokens(s.window)}`

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" columnGap={3} paddingX={1}>
          {cell('context', 'Context', s.percent ?? 0, ctxDetail)}
          {s.limits.map(l => cell(l.kind, label(l.kind), l.percentUsed, resets(l)))}
        </Box>
        {below}
      </Box>
    )
  })
}
```
