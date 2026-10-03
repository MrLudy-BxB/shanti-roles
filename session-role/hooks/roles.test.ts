import { test, expect } from 'claude-code/testing'

const HOME = '/Users/me'
const PROJ = '/Volumes/D/proj'
const files: Record<string, string> = {
  [`${PROJ}/.claude/roles/bot-dev.md`]: '---\ndescription: Bot dev\nedit: web/**, docs/handoff.md\n---\nYou build the bot.',
  [`${PROJ}/sub/.claude/roles/bot-dev.md`]: '---\ndescription: Nearer twin\n---\nNearer.',
  [`${PROJ}/sub/.claude/roles/tester.md`]: '---\ndescription: Tester\n---\nTest.',
  [`${HOME}/.claude/roles/reviewer.md`]: '---\ndescription: Reviewer\n---\nReview.',
}
const dirs = (p: string) => Object.keys(files).some(f => f.startsWith(`${p}/`))

function stub(on: any, root: string) {
  const state = new Map<string, unknown>()
  const store = new Map<string, unknown>()
  const v = (x: unknown) => ({ value: x })
  on('session.root', () => v(root))
  on('session.id', () => v('sid'))
  on('session.append', () => v({}))
  on('process.run', () => v({ exitCode: 0, stdout: `${HOME}\n`, stderr: '' }))
  on('fs.exists', (_$: any, e: any) => v(dirs(e.path) || e.path in files))
  on('fs.list', (_$: any, e: any) =>
    v(Object.keys(files).filter(f => f.slice(0, f.lastIndexOf('/')) === e.path).map(f => ({ name: f.slice(f.lastIndexOf('/') + 1), kind: 'file' }))))
  on('fs.read', (_$: any, e: any) => v(files[e.path]))
  on('store.get', (_$: any, e: any) => v(store.get(e.key)))
  on('store.set', (_$: any, e: any) => { store.set(e.key, e.value); return v(undefined) })
}

test('subfolder session sees the root role; the nearer twin wins', async ($: any, on: any) => {
  stub(on, `${PROJ}/sub`)
  const r = await $.command.run({ command: 'role', args: '', origin: 'user', presentation: 'local' })
  console.log(r.text)
  expect(r.text).toContain('tester')
  expect(r.text).toContain('Nearer twin')
  expect(r.text).not.toContain('— Bot dev')
  expect(r.text).toContain('reviewer')
})

test('fence resolves against the folder holding the role', async ($: any, on: any) => {
  stub(on, `${PROJ}/app/deep`)
  on('tool.call', () => ({ result: { text: 'ok' } }))
  const l = await $.command.run({ command: 'role', args: '', origin: 'user', presentation: 'local' })
  console.log(l.text)
  expect(l.text).toContain(`Local roles (${PROJ}/.claude/roles)`)
  const s = await $.command.run({ command: 'role', args: 'bot-dev', origin: 'user', presentation: 'local' })
  console.log(s.text)
  const ok = await $.tool.call({ tool: 'Edit', file_path: `${PROJ}/web/a.ts`, old_string: 'a', new_string: 'b', tool_use_id: 't1' })
  const okRel = await $.tool.call({ tool: 'Write', file_path: `${PROJ}/docs/handoff.md`, content: 'x', tool_use_id: 't2' })
  const no = await $.tool.call({ tool: 'Edit', file_path: `${PROJ}/app/deep/web/a.ts`, old_string: 'a', new_string: 'b', tool_use_id: 't3' })
  console.log(JSON.stringify([ok, okRel, no]))
  expect(ok.isError ?? false).toBe(false)
  expect(okRel.isError ?? false).toBe(false)
  expect('deny' in no).toBe(true)
})

test('the band refresh button re-reads the role folders', async ($: any, on: any) => {
  stub(on, PROJ)
  const v = (x: unknown) => ({ value: x })
  on('agent.list', () => v([]))
  on('ui.toast', () => v(undefined))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  const ui = await $.ui.mount({ plugin: 'session-role', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} as any, view: {} as any } })
  expect(await ui.find({ key: 'refresh' })).toBeDefined()
  files[`${PROJ}/.claude/roles/late.md`] = '---\ndescription: Added by another session\n---\nLate.'
  await ui.press({ key: 'refresh' })
  const opts = JSON.stringify(await ui.drawn())
  expect(opts).toContain('late@local')
  const l = await $.command.run({ command: 'role', args: '', origin: 'user', presentation: 'local' })
  expect(l.text).toContain('late')
  delete files[`${PROJ}/.claude/roles/late.md`]
})
