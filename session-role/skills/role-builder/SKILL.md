---
name: role-builder
description: "How the session-role system works and how to build it for a user: global and local Roles, the role file format, and how CLAUDE.md, roles, agents and skills divide the work. Load this BEFORE creating, editing, reviewing or explaining a role; before setting up roles for a project; before rewriting a CLAUDE.md in a project that uses (or should use) roles; and whenever the user mentions roles, the Role picker above the chat box, /role, .claude/roles or ~/.claude/roles, or asks which role should do what. Also load it when a project's CLAUDE.md mixes project facts with persona or job instructions."
---

# Roles

The `session-role` plugin gives each Claude Code session a **Role**: a job description for the main Claude the user talks to, picked from the dropdown above the chat box or with `/role`. This skill is how you, Claude, build and maintain that system for the user.

## 1. What goes where

Four kinds of instructions exist. Keeping them separate is the whole point of the system.

| | What it holds | Who it applies to | Lives in |
|---|---|---|---|
| **CLAUDE.md** | **Facts about the project**: what it is, stack, commands, folder layout, conventions, rules every contributor follows | Every session in the project, whatever its role | `<project>/CLAUDE.md` (local), `~/.claude/CLAUDE.md` (global) |
| **Role** | **Who this session is**: its responsibility, how it works with the user, what it owns and must not touch, how it hands work to other roles | Only sessions where the user picked it | `<project root>/.claude/roles/<name>.md` (local), `~/.claude/roles/<name>.md` (global) |
| **Agent** | A specialist the session **sends one task to**; it reports back once and never sees the conversation | Called by Claude (or the user) for a task | `.claude/agents/<name>.md`, `~/.claude/agents/` |
| **Skill** | A **manual**: how to do a particular kind of task, step by step | Loaded by any session when relevant | `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/` |

**The test for any instruction:**
- True for everyone working on this project? → **CLAUDE.md**
- True only while doing one job ("you focus on the frontend", "talk through UI decisions first")? → **a role**
- A self-contained task that can be delegated with a brief? → **an agent**
- A reusable procedure? → **a skill**

Without a role (**No role** in the picker), a session is Claude Code's default assistant plus CLAUDE.md.

## 2. Global and local roles

- **Global** (`~/.claude/roles/<name>.md`): follows the user into every project. Use for personas that aren't tied to one codebase, e.g. `reviewer`, or the user's own business lead-developer role.
- **Local** (`<project root>/.claude/roles/<name>.md`): exists only in that project. Use for jobs defined by the project's structure, e.g. `frontend` (owns `web/**`) and `backend` (owns `api/**`).
- **Local roles live at the project root**: the project's top folder, i.e. the git root (`git rev-parse --show-toplevel`), or, outside git, the folder with the project's main `CLAUDE.md`. **Never** put them in a subfolder just because your session happens to run there.
- **Found from every subfolder**, like CLAUDE.md: the plugin reads `.claude/roles/` in the session's folder and every folder above it (up to the home folder), so roles at the root show up for sessions opened anywhere inside the project. A role's `edit:` paths are relative to the folder holding its `.claude/roles/`, i.e. the project root. If two folders define the same name, the nearer one wins.
- **Same name in both:** the local one wins. The picker shows both, labelled by scope; `/role <name>@global` picks the global copy.
- **The role's name is its filename** (`frontend.md` → `frontend`). Use lowercase-with-dashes.
- Local roles are part of the project: commit `.claude/roles/` so everyone on the project gets them. Global roles are personal.

## 3. The role file

```markdown
---
description: Focuses on the web UI — components, styling, client-side state.   # one line, shown in /role
default: true                                                            # optional, local only
---
You are the frontend lead for this project. You mainly work in web/ and packages/ui/. …
```

**Focus, not fence (the default).** Roles in one project share it, and real work crosses folders: a UI change needs an API tweak, a new skill needs a README row. So a role names its **main area** and how it coordinates with the others, and it may still change whatever a task needs: it keeps the change coherent with the rest of the project and tells the user what it touched outside its area. Write "You mainly work in web/", not "You own web/; never change anything else".

**Hard limits only on request.** `edit:`, `tools:`, `agents:` and "never …" or "only …" rules turn the role into a cage. Add them **only when the user asks for separation or a restriction**: "each role stays in its own folder", "a read-only reviewer", "it must never touch the database". Then write them as blocks, not advice:

```markdown
edit: web/**, packages/ui/**, docs/api-requests.md   # Edit/Write outside these are blocked
tools: Read, Grep, Glob                              # other tools are blocked
agents: Explore                                      # other agents are hidden and refused
```

| Field | Effect | Enforced? |
|---|---|---|
| *(body)* | The role's instructions, written to Claude ("You are…"). Optional: an empty body makes the role a label only | instructions |
| `description` | Shown in `/role` and the picker | — |
| `edit` | **Only when the user wants a hard boundary.** Globs Claude's **Edit, Write and NotebookEdit** may touch. Relative to the folder holding the role's `.claude/roles/` (the project root), or absolute with `~/` or `/`. A bare folder means everything under it | **Yes**, main conversation only |
| `tools` | **Only on request** (e.g. a read-only reviewer). Tool allow-list. `all` or omitted = every tool. `mcp__server__*` allows one server. `Bash(git:*)` allows **all** Bash (the bracket part isn't checked) | **Yes**, main conversation only |
| `agents` | **Only on request.** Agents the session may delegate to; others are hidden and refused | **Yes** |
| `default: true` | New sessions in the project start in this role (local roles only; use for at most one). Without one, new sessions start on No role, which the picker then tags *(default)* | — |

There is **no `model` field**: a role runs on whatever model the session uses.

**Limits to tell the user about** (when a role has hard limits):
- The edit fence doesn't cover shell commands. For a hard boundary, leave `Bash` out of `tools:`, or run each role in its own git worktree.
- Subagents keep their own rules; the fence and tool list apply to the main conversation.
- Switching roles keeps the conversation history. For a clean start, the user opens a new session and runs `/role <name>` first (or `/role <name> <task>`).

## 4. How a role reaches you

When the user switches, the plugin adds a note to the conversation: `— Role switched: A → B. From here on, follow this role: —` followed by the role's full text. **That note is your instruction:** follow it until the next switch note. A switch to No role means return to the default assistant. After compaction the plugin re-sends the active role.

If the user asks "what is your role?", answer from the latest switch note; if there is none, you have no role: you are Claude Code's default assistant.

## 5. Workflows

### A. Create a role

1. Ask only what you can't infer: **name**, **global or local**, and **what it focuses on**. Don't ask about fences or tool limits: add them only if the user brings up separation or a restriction (§3).
2. For a local role, **find the project root** first (see §2) and compare it with your session's folder. If they differ (you're running in a subfolder), say so and confirm with the user where the role should go before writing. Then check the name isn't taken there (`ls ~/.claude/roles <project root>/.claude/roles`).
3. Write the file from the template in [references/templates.md](references/templates.md). Body: who it is, its main area, how it works with the user, how it coordinates with other roles, and only the "never" rules the user actually gave. Keep it to the job: project facts belong in CLAUDE.md.
4. Run the conflict check (workflow C) on it.
5. Tell the user it's in the dropdown now (the list refreshes as soon as you write the file; other sessions in the project pick it up within 30 seconds, or at once with the band's ↻), and show `/role <name> <first task>`.

### B. Set up roles for a project

Use when the user wants roles for a project, or when CLAUDE.md is doing a role's job.

1. **Find the project root** (§2). If your session runs in a subfolder, tell the user and confirm the root before anything else: roles, the CLAUDE.md you rewrite and the hand-off file all belong there, and any `edit:` globs are written relative to it (e.g. `app/convex/**`, not `convex/**`).
2. **Read** the root's `CLAUDE.md`, `.claude/agents/`, `.claude/roles/` (if any) and `~/.claude/roles/`, plus any `.claude/roles/` in subfolders (move them to the root unless they're truly subfolder-only). Skim the folder layout (top two levels) to see the natural areas of focus.
3. **Sort** every instruction in CLAUDE.md with the test in §1: project fact, role material, or something to drop.
4. **Propose** to the user, before writing anything:
   - the roles (2–4 is usual; more makes the picker noisy), each with its focus area and whether it's local or global. Propose **no** `edit:`/`tools:`/`agents:` limits unless the user asked for separation; if they did, propose the fence for each role;
   - which CLAUDE.md lines move to which role;
   - the new CLAUDE.md outline;
   - whether one role should be `default: true`.
5. **On approval**, at the project root:
   - create `.claude/roles/*.md`;
   - rewrite CLAUDE.md as a **role-neutral project description** (template in references). Show the user the diff, and keep the old version as `CLAUDE.md.bak` until they confirm;
   - if roles hand work to each other, create the shared hand-off file they name (e.g. `docs/handoff.md`).
6. Run the conflict check (C) on every role, then tell the user how to try each one.

**Never** overwrite CLAUDE.md without showing the change first. **Never** move a project-wide rule (security, "don't touch X", test commands) out of CLAUDE.md into a single role: every role must still see it.

### C. Conflict check (review roles)

For each role, check:
- **Fence vs. instructions:** does the body tell it to edit something its `edit:` fence blocks (a shared hand-off file, `package.json`, a README, the session scratchpad under `/private/tmp`)? Add the path or change the instruction.
- **Tools vs. instructions:** does it say "run the tests" with no `Bash`?
- **Over-restriction:** does a role have `edit:`, `tools:`, `agents:` or "never"/"only" rules the user didn't ask for? Suggest focus wording instead and dropping the fields; keep them only where the user wanted separation.
- **Overlap:** two roles focusing on the same area is normal. Two roles *fenced* to the same folder is fine only if intended.
- **Leaks:** does a role contain project facts every role needs? Move them to CLAUDE.md.
- **Hand-offs:** if roles exchange work through a file, every role involved can edit it, and the file exists.
- **Placement:** every local role is in the project root's `.claude/roles/`, and any `edit:` globs are relative to that root.
- **Secrets:** no keys or tokens in any role or CLAUDE.md.

## 6. Commands to give the user

| | |
|---|---|
| `/role` | list roles; ● marks the active one; roles from a parent folder are listed under that folder |
| `/role show [name]` (or ⓘ in the band) | the Roles panel: every role's description, limits and full prompt, with a Use button; point a user here when they're unsure which role to pick |
| `/role <name>` | switch |
| `/role <name> <task>` | switch and start the task, e.g. as the first message of a new session |
| `/role <name>@global` | pick the global copy when a local one shadows it |
| `/role off` | back to No role (Claude Code's default assistant) |
