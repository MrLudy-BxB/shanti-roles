# session-role: a Claude Code mod

Gives each Claude Code session a **Role**: a job description for the Claude you talk to. You pick it from a dropdown above the chat box. Two sessions in the same project can hold different roles at the same time, e.g. `frontend` and `backend`.

```
Role [ shanti-developer ▾ ] ⓘ  ● Working   Subagents Explore ×2   ↻
Context ▬▬── 22% 218.6k / 1M     Session ▬─── 3% ↻ 16:30     Week ▬─── 2% ↻ Mon 7:00
```

The second line comes from the separate `usage-band` mod; the two lines stack. **ⓘ** opens the **Roles panel**, and the **↻** at the end of the first line refreshes both lines: the role list, the subagent list and (with usage-band) the usage figures.

## Role, agent, skill

| | What it is | Example |
|---|---|---|
| **Role** | Who *this session* is. You pick it and talk to it | `frontend`, `shanti-developer` |
| **Agent** | A specialist the session *sends work to*; it does one task and reports back | `Explore`, `hyv-researcher` |
| **Skill** | A manual any session *reads* to learn how to do something | `hearyourvoice` |

No role picked = **No role** in the picker: Claude Code's default assistant. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## The `role-builder` skill (included)

The plugin ships a skill, `role-builder` (`/role-builder` in the slash menu, full name `session-role:role-builder`), that teaches Claude the whole system: what belongs in CLAUDE.md versus a role, global versus local roles, the file format and its limits. Claude loads it on its own when you talk about roles. Just ask:

- *"Create a global reviewer role."*
- *"Set up roles for this project."* Claude reads your CLAUDE.md, proposes a set of roles, moves job-specific instructions into them, and rewrites CLAUDE.md as a role-neutral project description, showing you the change first.
- *"Check my roles for conflicts."*

## Writing a role

A role is a markdown file:
- **Global** (every project): `~/.claude/roles/<name>.md`
- **Local** (one project): `<project>/.claude/roles/<name>.md`, at the **project root**. A local role overrides a global one with the same name.

Like `CLAUDE.md`, local roles are found from anywhere inside the project: a session opened in `<project>/app/` also sees `<project>/.claude/roles/` (the mod looks in the session's folder and every folder above it, up to your home folder; the nearest copy of a name wins). A role's `edit:` paths are relative to the folder that holds its `.claude/roles/`, so `edit: web/**` means `<project>/web/**` from every subfolder.

```markdown
---
name: frontend
description: Focuses on the web UI.            # shown in /role
default: true                                  # optional, local roles only: new sessions start in it
---
You are the frontend lead for this project. You mainly work in web/. …
```

By default a role is a **focus, not a fence**: it says where the session mainly works, and it can still change other parts of the project when a task needs it. Roles in one project usually have to work together. If you want hard separation, add limits; they're enforced:

```markdown
edit: web/**, docs/api-requests.md   # Edit/Write outside these are blocked
tools: Read, Grep, Glob              # other tools are blocked (e.g. a read-only reviewer)
agents: Explore                      # other agents are hidden and refused
```

Everything in the header is optional, and a role with no body is fine: it's just a label. The role's name is its **filename** (`frontend.md` → `frontend`); `name:` is only a second way to find it with `/role`. There's no `model` setting: a role runs on whatever model the session uses.

Two full examples are in [`examples/roles/`](examples/roles/) (`frontend.md` and `backend.md`: focus roles that coordinate through `docs/api-requests.md`).

## Using it

| | |
|---|---|
| **Dropdown** above the chat box | No role, then every local and global role. The project's default is tagged *(default)*; when no role has `default: true`, that's No role |
| `/role` | List roles; ● marks the active one |
| `/role show [name]` | Open the Roles panel (same as ⓘ), optionally with that role's prompt open |
| `/role <name>` | Switch (`<name>@global` picks the global copy) |
| `/role <name> <task>` | Switch, then send the task as your first message in that role. Type it on the **new-session screen** to start a session in a role. |
| `/role off` | Back to No role (Claude Code's default assistant) |

**Not sure which role to pick?** Press **ⓘ** (or `/role show`). The Roles panel opens beside the chat with one card per role:
- its description, scope, and whether it's the project default;
- its limits (what it may edit, which tools and agents it may use);
- **Show prompt**: the full text Claude receives when you switch to it;
- **Use**: switch to it from the card.

**Starting a session in a role:** the new-session screen is the desktop app's own UI, so no mod can draw a picker there. Instead, type `/role mod-builder fix the toggle` as your first message, or give a local role `default: true`.

When you switch, a note goes into the conversation: `— Role switched: A → B. From here on, follow this role: —`, followed by the role's full text. That note is the reliable way Claude receives the role; the mod also adds the role to the system prompt, which only takes effect in some setups. The previous conversation stays, so for a clean start, open a new session first.

**What's enforced, not just asked for** (in the main conversation; subagents keep their own rules):
- **Edit fence (`edit:`):** writes outside it through Edit, Write and NotebookEdit are blocked. Shell commands aren't covered: leave `Bash` out of `tools:` or use a separate git worktree for full isolation.
- **Tool allow-list (`tools:`):** other tools are blocked. `Bash(git:*)` allows all of Bash; the part in brackets isn't checked.
- **Agents (`agents:`):** other agents aren't offered to the session, and starting one by name is refused.

**Kept for you:** a resumed session gets its role back. After a long conversation is compacted, the role is handed over again.

**Staying current:** roles added by another session, an editor or Finder show up in the dropdown on their own: right after Claude writes one, after every turn, and every 30 seconds. Press **↻** to refresh at once.

## Install with /plugin (recommended)

This mod is part of the **shanti-roles** plugin marketplace ([github.com/MrLudy-BxB/shanti-roles](https://github.com/MrLudy-BxB/shanti-roles)). Add the marketplace once, then install:

```bash
claude plugin marketplace add MrLudy-BxB/shanti-roles
claude plugin install session-role@shanti-roles
```

From a local copy of this repo, use its folder path instead of `MrLudy-BxB/shanti-roles`. The band appears right away; start a new session if it doesn't. Update later with `claude plugin marketplace update shanti-roles`, then `claude plugin update session-role@shanti-roles` and `claude plugin update usage-band@shanti-roles` (refreshing the marketplace alone doesn't update installed plugins), and restart the app.

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
| `hooks/roles.test.ts` | engine tests (`claude plugin test session-role`) |
| `ARCHITECTURE.md` | the design |
| `examples/roles/` | sample roles |

The mod reads role files and the session's own data, and runs one local command (`printenv HOME`) to find your home folder. It makes no network calls.
