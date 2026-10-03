# session-role: a Claude Code mod

Gives each Claude Code session a **Role**: a job description for the Claude you talk to. You pick it from a dropdown above the chat box. Two sessions in the same project can hold different roles at the same time, e.g. `frontend` and `backend`.

```
Role [ shanti-developer ▾ ]   ● Working   ↳ Explore   ↳ hyv-researcher ×2
Context ▬▬── 22% 218.6k / 1M     Session ▬─── 3% ↻ 16:30     Week ▬─── 2% ↻ Mon 7:00
```

The second line comes from the separate `usage-band` mod; the two lines stack.

## Role, agent, skill

| | What it is | Example |
|---|---|---|
| **Role** | Who *this session* is. You pick it and talk to it | `frontend`, `shanti-developer` |
| **Agent** | A specialist the session *sends work to*; it does one task and reports back | `Explore`, `hyv-researcher` |
| **Skill** | A manual any session *reads* to learn how to do something | `hearyourvoice` |

No role picked = **Plain Claude**, Claude Code's default. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## The `roles` skill (included)

The plugin ships a skill, `session-role:roles`, that teaches Claude the whole system: what belongs in CLAUDE.md versus a role, global versus local roles, the file format and its limits. Claude loads it on its own when you talk about roles. Just ask:

- *"Create a global reviewer role."*
- *"Set up roles for this project."* Claude reads your CLAUDE.md, proposes a set of roles, moves job-specific instructions into them, and rewrites CLAUDE.md as a role-neutral project description, showing you the change first.
- *"Check my roles for conflicts."*

## Writing a role

A role is a markdown file:
- **Global** (every project): `~/.claude/roles/<name>.md`
- **Local** (one project): `<project>/.claude/roles/<name>.md`. A local role overrides a global one with the same name.

```markdown
---
name: frontend
description: Owns the web UI.                  # shown in /role
edit: web/**, packages/ui/**, docs/api-requests.md   # optional edit fence
tools: Read, Write, Edit, Grep, Glob, Bash     # optional tool allow-list
agents: Explore                                # optional: agents it may delegate to
default: true                                  # optional, local roles only: new sessions start in it
---
You are the frontend lead for this project. …
```

Everything in the header is optional, and a role with no body is fine: it's just a label. The role's name is its **filename** (`frontend.md` → `frontend`); `name:` is only a second way to find it with `/role`. There's no `model` setting: a role runs on whatever model the session uses.

Two full examples are in [`examples/roles/`](examples/roles/) (`frontend.md` and `backend.md`, which hand work to each other through `docs/api-requests.md`).

## Using it

| | |
|---|---|
| **Dropdown** above the chat box | Plain Claude, then every local and global role |
| `/role` | List roles; ● marks the active one |
| `/role <name>` | Switch (`<name>@global` picks the global copy) |
| `/role <name> <task>` | Switch, then send the task as your first message in that role. Type it on the **new-session screen** to start a session in a role. |
| `/role off` | Back to Plain Claude |

**Starting a session in a role:** the new-session screen is the desktop app's own UI, so no mod can draw a picker there. Instead, type `/role mod-builder fix the toggle` as your first message, or give a local role `default: true`.

When you switch, a note goes into the conversation: `— Role switched: A → B. From here on, follow this role: —`, followed by the role's full text. That note is the reliable way Claude receives the role; the mod also adds the role to the system prompt, which only takes effect in some setups. The previous conversation stays, so for a clean start, open a new session first.

**What's enforced, not just asked for** (in the main conversation; subagents keep their own rules):
- **Edit fence (`edit:`):** writes outside it through Edit, Write and NotebookEdit are blocked. Shell commands aren't covered: leave `Bash` out of `tools:` or use a separate git worktree for full isolation.
- **Tool allow-list (`tools:`):** other tools are blocked. `Bash(git:*)` allows all of Bash; the part in brackets isn't checked.
- **Agents (`agents:`):** other agents aren't offered to the session, and starting one by name is refused.

**Kept for you:** a resumed session gets its role back. After a long conversation is compacted, the role is handed over again.

## Install with /plugin (recommended)

This mod is part of the **shanti-roles** plugin marketplace ([github.com/MrLudy-BxB/shanti-roles](https://github.com/MrLudy-BxB/shanti-roles)). Add the marketplace once, then install:

```bash
claude plugin marketplace add MrLudy-BxB/shanti-roles
claude plugin install session-role@shanti-roles
```

From a local copy of this repo, use its folder path instead of `MrLudy-BxB/shanti-roles`. The band appears right away; start a new session if it doesn't. Update later with `claude plugin marketplace update shanti-roles`.

## Other ways to install

Needs Claude Code **2.1.286 or newer**. Unzip `dist/session-role.zip` to get a `session-role/` folder, then either:

1. **Always on (recommended):** copy it to `~/.claude/skills/session-role/` and start a new session.
   ```bash
   cp -R session-role ~/.claude/skills/
   ```
2. **Terminal, one session:** `claude --plugin-dir /path/to/session-role`
3. **Desktop app, fixed folder:** add `"CLAUDE_CODE_PLUGIN_DIRS": "/absolute/path/to/session-role"` to the `env` block of `~/.claude/settings.json` and restart the app.

Check it with `claude plugin validate /path/to/session-role`. Or send [PROMPT.md](PROMPT.md) to someone and their Claude builds it for them.

## Files

| File | |
|---|---|
| `.claude-plugin/plugin.json` | name, version, description |
| `hooks/hooks.json` | points Claude Code at the module |
| `hooks/register.tsx` | the mod |
| `types/index.d.ts` | the shape of the values it keeps |
| `ARCHITECTURE.md` | the design |
| `examples/roles/` | sample roles |

The mod reads role files and the session's own data, and runs one local command (`printenv HOME`) to find your home folder. It makes no network calls.
