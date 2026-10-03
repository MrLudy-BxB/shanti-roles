# Shanti Roles

Claude Code plugins (mods) that make sessions easier to steer and to watch:

| Plugin | What it does |
|---|---|
| **session-role** | Gives each session a **Role**: a job description for the Claude you talk to, picked from a dropdown above the chat box. Roles are markdown files, global (`~/.claude/roles/`) or per project (`.claude/roles/`), with an optional edit fence and tool limits. Shows when Claude is working and which subagents are running. |
| **usage-band** | An always-on line above the chat box: how full the context window is, and your plan's session and weekly usage with reset times. |

```
Role [ frontend ▾ ] ⓘ  ● Working                     Subagents  Explore ×2 · general-purpose  ↻
Context ▬▬── 35% 352.8k / 1M          Session ▬─── 10% ↻ 16:30          Week ▬─── 3% ↻ Mon 7:00
```

## Install

Needs Claude Code **2.1.286 or newer** (desktop app or terminal).

```bash
claude plugin marketplace add MrLudy-BxB/shanti-roles
claude plugin install session-role@shanti-roles
claude plugin install usage-band@shanti-roles
```

The band appears right away (start a new session if it doesn't). Update later with `claude plugin marketplace update shanti-roles`, then `claude plugin update session-role@shanti-roles` and `claude plugin update usage-band@shanti-roles` (refreshing the marketplace alone doesn't update installed plugins), and restart the app.

## Your first role

Create `~/.claude/roles/reviewer.md`:

```markdown
---
description: Careful reviewer — reads and reports, never edits.
tools: Read, Grep, Glob
---
You are a careful reviewer. Back every finding with a file:line reference, most important first.
```

Pick **reviewer** in the dropdown, or start a session with `/role reviewer check the auth code`.

Or let Claude build the system for you: `session-role` includes a **roles** skill, so you can just say *"set up roles for this project"*. Claude splits your CLAUDE.md into a role-neutral project description plus role files, and shows you the changes first.

More in [session-role/README.md](session-role/README.md), the design in [session-role/ARCHITECTURE.md](session-role/ARCHITECTURE.md), and two paired examples (`frontend`, `backend`) in [session-role/examples/roles/](session-role/examples/roles/).

## Repository layout

```
.claude-plugin/marketplace.json   the catalog Claude Code reads (marketplace "shanti-roles")
session-role/                     plugin: roles, picker, edit fence, subagent indicator, role-builder skill
usage-band/                       plugin: context and usage band
export.py                         maintainer tool: re-export a plugin from its dev folder
```

Each plugin folder also has a `PROMPT.md`: paste it into Claude Code and Claude rebuilds the plugin for you, without installing anything from GitHub.
