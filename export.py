#!/usr/bin/env python3
"""Export a mod from its dev folder into mods/<name>/ and dist/<name>.zip.

    python3 mods/export.py <dev-mod-folder>

- copies .claude-plugin/plugin.json, hooks/, types/ (skips the engine's generated
  .claude-plugin/types/ folder and tsconfig.json)
- rebuilds PROMPT.md: keeps everything above the first "### `" heading (the intro you
  wrote) and regenerates the file blocks below it from the real files
- zips mods/<name>/ to dist/<name>.zip (no .DS_Store)
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

MODS = Path(__file__).resolve().parent
DIST = MODS.parent / "dist"
SHIPPED = [".claude-plugin/plugin.json", "hooks/hooks.json", "types/index.d.ts", "hooks/register.tsx"]
LANG = {".json": "json", ".ts": "ts", ".tsx": "tsx"}


def main(dev: Path) -> None:
    name = json.loads((dev / ".claude-plugin/plugin.json").read_text())["name"]
    out = MODS / name

    for rel in SHIPPED:
        src = dev / rel
        if src.exists():
            (out / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, out / rel)

    prompt = out / "PROMPT.md"
    intro = prompt.read_text().split("\n### `")[0].rstrip() if prompt.exists() else f"# {name}"
    blocks = [
        f"### `{name}/{rel}`\n\n```{LANG.get(Path(rel).suffix, '')}\n{(out / rel).read_text().rstrip()}\n```"
        for rel in SHIPPED
        if (out / rel).exists()
    ]
    prompt.write_text(intro + "\n\n" + "\n\n".join(blocks) + "\n")

    DIST.mkdir(exist_ok=True)
    zip_path = DIST / f"{name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.rglob("*")):
            if f.is_file() and f.name != ".DS_Store":
                z.write(f, Path(name) / f.relative_to(out))
    print(f"exported {name} -> {out.relative_to(MODS.parent)} and {zip_path.relative_to(MODS.parent)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).expanduser().resolve())
