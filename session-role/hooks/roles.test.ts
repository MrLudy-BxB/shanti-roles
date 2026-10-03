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

test('No role carries the default tag only when no role is the default', async ($: any, on: any) => {
  stub(on, PROJ)
  const v = (x: unknown) => ({ value: x })
  on('agent.list', () => v([]))
  on('ui.toast', () => v(undefined))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  const ui = await $.ui.mount({ plugin: 'session-role', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} as any, view: {} as any } })
  expect(JSON.stringify(await ui.drawn())).toContain('No role (default)')
  const l = await $.command.run({ command: 'role', args: '', origin: 'user', presentation: 'local' })
  expect(l.text).toContain('No role is the default here')

  const before = files[`${PROJ}/.claude/roles/bot-dev.md`]
  files[`${PROJ}/.claude/roles/bot-dev.md`] = before.replace('---\nYou', 'default: true\n---\nYou')
  await ui.press({ key: 'refresh' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).not.toContain('No role (default)')
  expect(drawn).toContain('bot-dev (default)')
  files[`${PROJ}/.claude/roles/bot-dev.md`] = before
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`roles panel on ${surface}: read a prompt, then use the role`, async ($: any, on: any) => {
    stub(on, PROJ)
    const v = (x: unknown) => ({ value: x })
    on('agent.list', () => v([]))
    on('ui.toast', () => v(undefined))
    on('ui.open', (_$: any, e: any) => v({ isPlaced: true, id: e.id }))
    on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
    const band = await $.ui.mount({ plugin: 'session-role', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} as any, view: {} as any } })
    expect(await band.find({ key: 'roles-info' })).toBeDefined()
    await band.press({ key: 'roles-info' })
    const pane = await $.ui.mount({ plugin: 'session-role', surface, component: 'Pane', requestId: 'session-role-roles',
      props: { title: 'Roles', isFocused: false, bodyColumns: 80 } as any })
    expect(await pane.find({ type: 'Text', text: 'Bot dev' })).toBeDefined()
    expect(await pane.find({ key: 'md:bot-dev@local' })).toBeUndefined()
    await pane.press({ key: 'prompt:bot-dev@local' })
    const md = await pane.find({ key: 'md:bot-dev@local' })
    expect(md).toBeDefined()
    expect(JSON.stringify(md)).toContain('You build the bot.')
    await pane.press({ key: 'use:bot-dev@local' })
    expect(await pane.find({ type: 'Text', text: '● active' })).toBeDefined()
    expect(await pane.find({ key: 'use:bot-dev@local' })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'Bot dev' })).toBeDefined()
  })
}

test('a background subagent stays in the band after its Agent call returns', async ($: any, on: any) => {
  stub(on, PROJ)
  const v = (x: unknown) => ({ value: x })
  const agents = [{ id: 'bg1', description: 'Long job', type: 'Explore', status: 'running' }]
  on('agent.list', () => v(agents))
  on('agent.spawn', () => ({ model: 'm', agentId: 'bg1' }))
  on('tool.call', () => ({ result: { text: 'Async agent launched' } }))
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  const ui = await $.ui.mount({ plugin: 'session-role', surface: 'desktop', component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} as any, view: {} as any } })
  await $.agent.spawn({ tool_use_id: 'tu1', prompt: 'p', description: 'Long job', subagentType: 'Explore', background: true,
    provider: { kind: 'model' }, parentModel: 'm', fork: false })
  // Background is the default, so the call carries no run_in_background.
  await $.tool.call({ tool: 'Agent', tool_use_id: 'tu1', prompt: 'p', description: 'Long job', subagent_type: 'Explore' })
  expect(JSON.stringify(await ui.drawn())).toContain('Explore')

  agents[0].status = 'killed'
  await $.turn.complete({ status: 'completed', toolUses: [] }).catch(() => undefined)
  expect(JSON.stringify(await ui.drawn())).not.toContain('Explore')
})
