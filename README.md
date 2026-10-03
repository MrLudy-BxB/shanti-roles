# Shanti Roles

Claude Code plugins (mods) that make sessions easier to steer and to watch:

| Plugin | What it does |
|---|---|
| **session-role** | Gives each session a **Role**: a job description for the Claude you talk to, picked from a dropdown above the chat box. Roles are markdown files, global (`~/.claude/roles/`) or per project (`.claude/roles/`), with an optional edit fence and tool limits. Shows when Claude is working and which subagents are running. |
| **usage-band** | An always-on line above the chat box: how full the context window is, and your plan's session and weekly usage with reset times. |

```
Role [ frontend ▾ ]   ● Working                        Subagents  Explore ×2 · general-purpose
Context ▬▬── 35% 352.8k / 1M          Session ▬─── 10% ↻ 16:30          Week ▬─── 3% ↻ Mon 7:00
```

## Install

Needs Claude Code **2.1.286 or newer** (desktop app or terminal).

```bash
claude plugin marketplace add MrLudy-BxB/shanti-roles
claude plugin install session-role@shanti-roles
claude plugin install usage-band@shanti-roles
```

Start a new session. Update later with `claude plugin marketplace update shanti-roles`.

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

More in [session-role/README.md](session-role/README.md), the design in [session-role/ARCHITECTURE.md](session-role/ARCHITECTURE.md), and two paired examples (`frontend`, `backend`) in [session-role/examples/roles/](session-role/examples/roles/).

## Repository layout

```
.claude-plugin/marketplace.json   the catalog Claude Code reads (marketplace "shanti-roles")
session-role/                     plugin: roles, picker, edit fence, subagent indicator
usage-band/                       plugin: context and usage band
export.py                         maintainer tool: re-export a plugin from its dev folder
```

Each plugin folder also has a `PROMPT.md`: paste it into Claude Code and Claude rebuilds the plugin for you, without installing anything from GitHub.
