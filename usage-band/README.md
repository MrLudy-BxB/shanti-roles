# usage-band: a Claude Code mod

Shows a small always-on line above the chat box, so you don't have to open the usage popover:

```
Context ▬▬── 12% 119.9k / 1M     Session ▬─── 1% ↻ 16:30     Week ▬─── 2% ↻ Mon 7:00
```

- **Context**: how full the context window is
- **Session**: the 5-hour plan limit and when it resets
- **Week**: the weekly all-models limit and when it resets
- Each bar is blue, turns amber at 80% and red at 90%; from 80% the percentage turns bold in the same colour
- It shares the space above the chat box with other mods (e.g. `session-role`): each draws its own line
- It updates by itself after every turn and whenever a limit moves by a full point

Works in the Claude Code desktop app (Code tab) and in the terminal. Tested on Claude Code **2.1.286**; 2.1.270 is too old because it lacks the `session.measure` event. The terminal shows the text without the bars. Plan limits appear only on a Claude subscription (Pro/Max); with an API key you see Context only.

Per-model weekly limits (e.g. "Weekly · Fable") are not shown: Claude Code doesn't give that figure to mods. If a later version does, it will show up as `Week · <Model>` without any change.

## Two ways to share it

**A. Send the folder** (`usage-band/`, or `dist/usage-band.zip`). The other person runs the steps under "Install" below.

**B. Send the prompt** in [`PROMPT.md`](PROMPT.md). They paste it into Claude Code and Claude builds the mod for them. Nothing needs to be downloaded.

## Install with /plugin (recommended)

This mod is part of the **shanti-roles** plugin marketplace ([github.com/MrLudy-BxB/shanti-roles](https://github.com/MrLudy-BxB/shanti-roles)). Add the marketplace once, then install:

```bash
claude plugin marketplace add MrLudy-BxB/shanti-roles
claude plugin install usage-band@shanti-roles
```

From a local copy of this repo, use its folder path instead of `MrLudy-BxB/shanti-roles`. The band appears right away; start a new session if it doesn't. Update later with `claude plugin marketplace update shanti-roles`.

## Other ways to install (option A)

Unzip it so you have a `usage-band/` folder containing `.claude-plugin/`, `hooks/` and `types/`. Then pick one of these:

1. **Always on (recommended).** Copy the folder to `~/.claude/skills/usage-band/`. Claude Code loads plugins found in the skills folder automatically. Start a new session.
   ```bash
   cp -R usage-band ~/.claude/skills/
   ```
2. **Terminal, one session only:**
   ```bash
   claude --plugin-dir /path/to/usage-band
   ```
3. **Desktop app, from a fixed folder:** add the folder's absolute path to the `env` block in `~/.claude/settings.json`, then restart the app:
   ```json
   { "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/absolute/path/to/usage-band" } }
   ```

To check it, run `claude plugin validate /path/to/usage-band`. It should print `Validation passed`.

The line appears as soon as the session starts; Context shows 0% until Claude's first reply reports a token count.

## Files

| File | What it is |
|---|---|
| `.claude-plugin/plugin.json` | plugin name, version, description |
| `hooks/hooks.json` | points Claude Code at the module |
| `hooks/register.tsx` | the mod itself (about 90 lines) |
| `types/index.d.ts` | the type of the one value it keeps |

The mod only reads usage figures Claude Code already has. It makes no network calls, reads no files and doesn't touch your credentials.
