# session-role: architecture

A Claude Code mod that lets **each session take on a Role**: a persistent job description for the Claude you talk to, with its own instructions, tool limits and an edit fence. Two sessions in the same project can hold different roles at once (e.g. `frontend` and `backend`).

Status: v0.6.2 (2026-10-03): ● Working / ○ Ready is back in the band (0.6.1 had dropped it). v0.6.1: when no role has `default: true`, No role carries the *(default)* tag in the picker, the Roles panel and `/role`. v0.6.0: the no-role choice is called **No role** (was Plain Claude), and the bundled skill is renamed `role-builder` (was `roles`) so `/role-builder` no longer looks like the `/role` command. v0.5.0 added the Roles panel (ⓘ in the band, `/role show [name]`) to read every role's description, limits and full prompt before picking it, and the active role's description in the band. v0.4.0: local roles are found from any subfolder of the project (the session's folder and every parent up to home, nearest first), each role's `edit:` fence resolves against the folder holding it, and the band gets a ↻ refresh button. v0.3.0 added the bundled `roles` skill (`skills/roles/`), which teaches Claude this design so it can create roles and split a project's CLAUDE.md into project facts plus roles. Installable from the shanti-roles marketplace. Replaces the `session-agent` prototype. See §10 for what was seen working live.

---

## 1. Vocabulary

These three words mean different things. Everything else follows from them.

| Term | What it is | Who uses it | Lifetime | Sees your conversation |
|---|---|---|---|---|
| **Role** | Who *this session* is: a job description for the main Claude | You pick it (dropdown, `/role`) | The whole session, until you switch | **Yes**, it *is* the conversation |
| **Agent** | A specialist the session *sends work to* (a subagent) | Main Claude delegates; you can ask it to | One task, then it reports back | No, only the task message |
| **Skill** | A manual any session *reads* to learn how to do something | Main Claude loads it when relevant | Until the context is compacted | Yes (it's loaded into the session) |

In one line: **a Role is who you're talking to, Agents are who it delegates to, and Skills are what it reads.**

Without a role, a session has **No role** (that's its name in the picker): Claude Code's default main assistant. That's the default, and nothing changes unless you pick a role.

```
YOU ⇄ SESSION  (No role, or Role: frontend)
        │  reads ──▶ Skills      (manuals: how to do things)
        └─ sends ──▶ Agents      (specialists: do one task, report back)
```

---

## 2. Where things live

Roles follow the same global/local pattern as `CLAUDE.md`, skills and agents.

```
~/.claude/
├── CLAUDE.md                 global project rules        (always on)
├── roles/<name>.md           GLOBAL roles                (on when picked)
├── agents/<name>.md          global agents               (delegated to)
└── skills/<name>/SKILL.md    global skills               (read when relevant)

<project>/
├── CLAUDE.md                 local project rules         (always on)
└── .claude/
    ├── roles/<name>.md       LOCAL roles                 (on when picked)
    ├── agents/<name>.md      local agents
    └── skills/<name>/        local skills
```

**Lookup, like `CLAUDE.md`:** local roles are read from `.claude/roles/` in the session's root folder **and every folder above it**, stopping before the home folder (whose `.claude/roles/` is the global one) or `/`. So a session opened in `<project>/app/` still finds `<project>/.claude/roles/`. Each role remembers its **base**, the folder holding its `.claude/`; project-relative `edit:` globs resolve against that base (a global role's base is the session's root). Roles belong at the project root; a subfolder's `.claude/roles/` is only for roles that make sense in that subfolder alone.

**Resolution:** the nearest folder wins between two local roles of the same name, and a local role overrides a global role with the same name. The other copy still shows in the picker as "(overridden)" and can be picked explicitly with `/role name@global`.

**Why roles get their own folder instead of reusing `agents/`:** Claude Code automatically offers every file in `agents/` to the model as a subagent. A role file there would leak into delegation in every session. Keeping them separate keeps both systems clean.

---

## 3. The role file

Markdown with a front-matter header, the same shape as agent files, so they're easy to write.

```markdown
---
name: frontend
description: Owns the web UI — components, styling, client-side state.
edit: web/**, packages/ui/**     # edit fence: may only change files here (optional)
tools: all                       # tool allow-list, comma-separated; "all" or omitted = every tool
agents: Explore, ui-reviewer     # agents this role may delegate to (optional; omitted = all)
default: true                    # this project's default role for new sessions (optional, local roles only)
---
You are the frontend lead for this project. You own everything under web/ and packages/ui/.

- Talk with the user about UI decisions; propose before large refactors.
- When you need a backend change, do NOT make it. Append a request to docs/api-requests.md.
- Run `pnpm test --filter web` before saying a change is done.
```

| Field | Required | Effect | Enforced by |
|---|---|---|---|
| `name` | no (the filename is used) | Display name, `/role <name>` | — |
| `description` | recommended | Shown in the picker and in `/role` | — |
| *(body)* | no | The role's instructions. Empty = a label only ("work as the default assistant") | switch note + prompt composition (§4) |
| `edit` | no | Glob list of paths the role may write, relative to the role's base folder (§2) | `tool.call` guard on file tools (§5) |
| `tools` | no | Tool allow-list | `tool.call` guard (§5) |
| `agents` | no | Which agents are offered to this session | `agent.offer` filter (§5) |
| `default` | no | Auto-select for new sessions in this project | `session.start` (§6) |

### 3a. No `model` field, by design

A role isn't a separate worker. It's text added to the system prompt of **your own session**, so it always runs on the model that session uses, whatever you picked in the model menu (e.g. Opus 5.5). Nothing ever calls a role the way agents get called, so there's nothing for a `model:` field to control. A role file that still has `model:` (e.g. one copied from an agent) is accepted, and the field is ignored.

Pick a strong model for sessions with a role: the role is the main assistant you talk to and it makes the decisions. (Claude Code already shows the session's model, so the band doesn't repeat it.)

`model:` still matters for **agents**: they run as separate subagents, so `model: sonnet` on an agent picks what that subagent runs on.

---

## 4. How a role reaches the model

The role is added **on top of** Claude Code's normal prompt. Nothing is removed, and `CLAUDE.md` still applies.

**Finding from live testing (2026-10-03):** in the desktop app, a role picked *mid-session* did **not** reach the model through the system prompt. Only the switch note arrived. The likely reason is that the desktop host carries the per-session part of the prompt with the conversation's first message, so a role added later never appears. The role is therefore delivered on **two paths**:

| Path | How | When it reaches Claude |
|---|---|---|
| **Switch note** (primary) | `$.session.append`: a user-role note with the switch line **plus the full role text** | Always; confirmed live |
| System-prompt section (secondary) | `prompt.compose` appends a `session`-scoped section | Where the host sends it (e.g. a role active from the first message) |

The note is re-sent in two more cases: when a fresh session starts on a project's `default: true` role, and after compaction (which could otherwise summarise the note away). The diagram below shows the system-prompt path.

```
┌─ SYSTEM PROMPT ────────────────────────────────────────────────┐
│ 1. Claude Code's built-in instructions             (unchanged) │
│ 2. Output style, environment, tools, skills list   (unchanged) │
│ 3. ★ ROLE SECTION  (id: session-role:role, scope: session)     │
│    "# Role: frontend                                           │
│     For this session you are the frontend role…                │
│     You may only edit: web/**, packages/ui/**                  │
│     You may only use: …                                        │
│     <role body>"                                               │
└────────────────────────────────────────────────────────────────┘
┌─ FIRST USER MESSAGE: context ──────────────────────────────────┐
│ 4. CLAUDE.md global + local     (unchanged, applies to every   │
│                                   role; wins on conflicts)     │
│ 5. Memory, date…                                    (unchanged)│
└────────────────────────────────────────────────────────────────┘
  6. Conversation, including a marker each time the role changes:
     "— Role switched: No role → frontend —"
```

- **Hook:** `prompt.compose`. It appends one `session`-scoped section after the engine's own sections. It isn't cached, so a change takes effect on the next request.
- **Conflict rule (written into the section):** Claude Code's instructions and `CLAUDE.md` take precedence where they conflict with the role. Project rules belong in `CLAUDE.md`; the role carries the job.
- **Cost:** a switch changes the system prompt, so the first request after it rebuilds the prompt cache once.
- **Subagents should not get the role.** They have their own prompt from their agent file. *To verify while building:* whether `prompt.compose` also fires for subagent prompts. If it does, the hook must skip them so a frontend role doesn't leak into an `Explore` run.

---

## 5. Enforcement

Instructions tell the role what to do. These guards make the limits real.

| Guard | Hook | Rule | On violation |
|---|---|---|---|
| **Edit fence** | `tool.call` on `Edit`, `Write`, `NotebookEdit` (main loop only) | `file_path` must match one of the `edit:` globs, relative to the role's base folder (§2) | `deny`: "The frontend role may only edit web/**, packages/ui/**. Ask the user, or leave a request in docs/…" |
| **Tool allow-list** | `tool.call` (main loop only) | Tool name must be in `tools:`. `Bash(git:*)` allows Bash; `mcp__x__*` allows that server's tools | `deny` with the allowed list |
| **Agent list** | `agent.offer` + `agent.spawn` | Only agents in `agents:` are offered; a dispatch by name is refused too | Not offered; `deny` at spawn |

**Known limit of the edit fence:** it guards Claude's file-editing tools, not shell commands. A role with `Bash` can still run `sed -i` or `rm` anywhere. For a hard boundary:
- leave `Bash` out of the role's `tools:`, or
- run each session in its **own git worktree** (§7), so the sessions don't share files.

Subagents started by a role keep their **own** tool lists (Claude Code enforces those). Edit-fencing subagents is a v2 question (§10).

---

## 6. Lifecycle and state

```
            new session
                 │
     project has a default role? ── yes ──▶ Role: <default>
                 │ no
                 ▼
           No role ◀───────────────── /role off · picker "No role"
                 │                              ▲
   picker / /role X                             │
                 ▼                              │
            Role: X ──── picker / /role Y ──▶ Role: Y
                 │
     session closed → resumed later ──▶ Role: X restored
```

| State | Where | Scope | Purpose |
|---|---|---|---|
| `active` (the selected role) | `$.state` | this session, live | What the prompt, guards and band read |
| `choices` (every role, parsed) | `$.state` | this session | Fills the dropdown and the Roles panel; refreshed at start, on `/role`, right after any Write/Edit/shell command that touches a `.claude/roles` folder (from any loop), at the end of every turn and on `session.measure`, every 30 s (`$.clock.every`; written only when the list changed), and on the band's ↻. This catches roles added by other sessions or outside Claude |
| `running` (subagents in flight) | `$.state` | this session | The Subagents indicator |
| `expanded` | `$.state` | this session | Which roles' prompts the Roles panel shows |
| `role-by-session:<sessionId>` | `$.store` | survives restarts | Restores the role when a session is resumed |

**Switching** (picker or `/role`):
1. Load and parse the role file. A bad file is reported and the current role is kept.
2. Set `active`. The prompt, guards and band all follow from it.
3. Add a note to the conversation (`$.session.append`, a user-role note the model reads): `— Role switched: backend → frontend. From here on, follow this role: —` followed by the full role text (§4).
4. Save it under `role-by-session:<id>` in `$.store`.
5. Show a toast.

The role file is read **when you pick the role**. Edits to the file apply the next time it's picked. Re-picking the same role re-reads it.

---

## 7. Two roles, one project, at the same time

```
Session A — Role: frontend              Session B — Role: backend
  edit: web/**                            edit: api/**, db/**
  delegates → Explore, ui-reviewer        delegates → Explore, db-migrator
        │                                       │
        └────────────┬──────────────────────────┘
                     ▼
     SHARED: CLAUDE.md · the repo · git · docs/api-requests.md (the hand-off file)
```

- **Separate prompts.** Each session holds its own role in its own state, so they never mix.
- **Separate write areas.** The edit fence stops them overwriting each other through Claude's file tools.
- **Hand-offs through files.** The frontend role writes requests to `docs/api-requests.md`; the backend role reads and answers them. They don't see each other's conversations.
- **Strongest isolation.** The desktop app can start each session in its own git worktree, so there's no shared working copy at all. They merge through git like two developers would.

---

## 8. Interface

**Band above the chat box** (stacks with other mods such as `usage-band`):
```
Role [ frontend ▾ ] ⓘ  ● Working  Owns the web UI…   Subagents Explore · hyv-researcher ×2   ↻
Context ▬▬── 22% 218.6k / 1M     Session ▬─── 3% ↻ 16:30     Week ▬─── 2% ↻ Mon 7:00
```
- **Dropdown:** No role (tagged *(default)* when no role has `default: true`), then local roles, then global roles. Labels are just the role name; the scope appears only when a local and a global role share a name, and a project default is marked `(default)`.
- **● Working / ○ Ready:** whether the session is busy (green while working).
- **Description:** the active role's `description:`, dim, cut to fit.
- **ⓘ (Button, key `roles-info`):** opens the Roles panel at the active role.

**Roles panel** (`Pane`, id `session-role-roles`; also `/role show [name]`): one card per choice, No role first. Each card shows the name, scope, default/overridden tags, `● active`, the description, a limits line (edits · tools · agents), the file path, a **Show prompt** toggle that draws `roleSection(role)` as Markdown (exactly what the switch note hands Claude) and a **Use** button that switches. Which prompts are open is `expanded` in `$.state`. `choices` holds each parsed role (a `Role` plus `isOverridden`/`isDefault`), so the panel draws without reading files.

A hover card was tried and dropped: a `position: absolute` Box needs an opaque background to sit over the transcript, and mods get no theme colours, so any fixed colour breaks light or dark mode. The description sits inline instead.
- **Subagents:** subagents running now, grouped by type (`hyv-researcher ×2`), tracked from `agent.spawn` until their call or loop ends.
- **↻ (Button, key `refresh`):** re-reads the role folders and prunes finished subagents. `usage-band` hooks the same press (`ui.press` matched on plugin `session-role`, element `refresh`) and re-measures its figures, so one button refreshes the whole band. A mod can't raise `session.measure` itself (`$.session.measure` isn't on a plugin's `$`), so the press is shared instead.
- Deliberately **not** shown: the model (Claude Code shows it already), the edit fence, tool and agent counts. They're in `/role` and the switch note.

**Command:**

| Command | Effect |
|---|---|
| `/role` | List local and global roles; ● marks the active one |
| `/role show [name]` | Open the Roles panel, optionally with that role's prompt expanded |
| `/role <name>` | Switch (local wins) |
| `/role <name> <task>` | Switch, then submit the task as the person's message (`$.prompt.submit`, `asUser`): starts a session in a role from the new-session screen |
| `/role <name>@global` | Pick a specific copy |
| `/role off` | Back to No role |

On the terminal, the dropdown falls back to text and switching is done with `/role`.

**The new-session screen** is the desktop app's own UI and runs before any session (or mod) exists, so it can't show a picker. Two ways in: `/role <name> <task>` as the first message, or a local role with `default: true`. A task sent this way doesn't expand `@file` mentions or pasted images (a limit of plugin-submitted prompts).

---

## 9. Limits (what a mod can't do)

| Limit | Consequence | Workaround |
|---|---|---|
| A role switch doesn't erase history | The new role sees the old role's work | Start a new session for a clean slate |
| The edit fence doesn't cover shell commands | `Bash` can write anywhere | Leave out `Bash`, or use worktrees |
| Roles need Claude Code ≥ 2.1.286 | Older versions reject the mod | Update Claude Code |
| Resume restore depends on the session id staying stable across resume | If a resume gets a new id, the role isn't restored | To verify while building |

---

## 10. Build status (v0.5)

| Piece | Status |
|---|---|
| `/role`, dropdown, switching | ✅ seen working live |
| Switch note carrying the full role text | ✅ seen working live (shanti-developer, mod-builder) |
| Edit fence: block outside, allow inside | ✅ seen working live (mod-builder) |
| `~/` and `/` paths in `edit:` | ✅ unit-tested |
| Empty role (label only) | ✅ validated (skill-builder) |
| Tool allow-list (`tools:`) | validated + unit-tested, not yet seen live |
| `agents:` filter | validated, not yet seen live |
| Restore on resume | validated, not yet seen live |
| Project `default: true` at session start | ✅ seen working live (skill-builder) |
| Roles panel (ⓘ, `/role show`): cards, Show prompt, Use; inline description | ✅ engine-tested on desktop and terminal, not yet seen live |
| Roles found from a subfolder; fence resolves against the role's base; ↻ refresh (roles + usage) | ✅ engine-tested (`hooks/*.test.ts`, `claude plugin test`), not yet seen live |
| Re-send after compaction | validated, not yet seen live |
| Subagent indicator: grouped (`Explore ×2`), each removed as it finishes, cleanup after an interrupt | ✅ seen working live (3 parallel subagents, matched the background-tasks panel step by step) |

**v2 ideas:** edit-fence subagents too (they're spawned with `agentId`; check the parent's role); a `/role new` command that writes a role file from a short description; a per-project allow-list that hides unrelated global agents (saves their context tokens).
