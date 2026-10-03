import { test, expect } from 'claude-code/testing'

function stub(on: any) {
  const v = (x: unknown) => ({ value: x })
  on('session.usage', (_$: any, e: any) => v({ startedAt: 0, rateLimits: [{ kind: 'five_hour', percentUsed: 25 }],
    context: { tokens: 523900, window: 1000000, percent: 52, ...(e?.breakdown ? { breakdown: { totalTokens: 103000 } } : {}) } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('ui.press', (_$: any, e: any) => ({ element: e.element }))
  on('session.compact', (_$: any, e: any) => ({ messages: e.messages.slice(0, 1), tokensBefore: 523900, tokensAfter: 98000 }))
}
const props = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} as any, view: {} as any }

test('compaction shows the compacted size at once', async ($: any, on: any) => {
  stub(on)
  await $.session.start({ source: 'startup', cwd: '/x' } as any)
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', component: 'AbovePrompt', props })
  expect(JSON.stringify(await ui.drawn())).toContain('52%')
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }, { role: 'assistant', text: 'yo', toolUses: [] }] } as any)
  const after = JSON.stringify(await ui.drawn())
  console.log(after.match(/"\d+%"|98k[^"]*/g))
  expect(after).toContain('10%')
  expect(after).toContain('98k')
})

const fakeRole = {
  name: 'session-role',
  register: (on: any) => {
    on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any, next: any) => {
      const below = await next(e)
      const { Box, Button } = $.ui.resolve(e)
      return (globalThis as any).h(Box, {}, (globalThis as any).h(Button, { key: 'refresh', label: '↻', onPress: () => {} }), below)
    })
  },
}

test("session-role's refresh button re-measures the band", { plugins: [fakeRole] }, async ($: any, on: any) => {
  stub(on)
  await $.session.start({ source: 'startup', cwd: '/x' } as any)
  const ui = await $.ui.mount({ plugin: 'session-role', surface: 'desktop', component: 'AbovePrompt', props })
  expect(JSON.stringify(await ui.drawn())).toContain('523.9k')
  await ui.press({ key: 'refresh' })
  const after = JSON.stringify(await ui.drawn())
  console.log(after.match(/"\d+%"|103k[^"]*/g))
  expect(after).toContain('103k')
  expect(after).toContain('10%')
})
