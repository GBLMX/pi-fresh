#!/usr/bin/env python3
"""应用中文 slash 命令描述（内置命令 + 扩展命令）。

- 内置命令：patch bundle 里 BUILTIN_SLASH_COMMANDS 数组的 description。
- 扩展命令：patch 各 npm 包 registerCommand() 调用的 description 字段。
均按 name 匹配，幂等（重复运行无副作用）。内置命令首次 patch 前自动
备份英文原文到 <chunk>.bak。

用法:
    python E:/pi/agent/.pi-setup/apply-cn-slash.py
"""
import sys
import io
import json
import glob
import os
import re

SETUP_DIR = os.path.dirname(os.path.abspath(__file__))
MAP_FILE = os.path.join(os.path.dirname(SETUP_DIR), "cn-slash-commands.json")
AGENT_DIR = os.environ.get("PI_CODING_AGENT_DIR") or "E:/pi/agent"
CHUNK_DIR = os.environ.get("PI_CHUNK_DIR") or "E:/npm/node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks"
NPM_DIR = os.environ.get("PI_NPM_DIR") or os.path.join(AGENT_DIR, "npm", "node_modules")

# 含 registerCommand 的 pi 包（按 name 全局替换，src/dist 重复文件都会被 patch）
PKGS = [
    "pi-subagents", "pi-lens", "pi-powerline-footer", "pi-web-access", "pi-mcp-adapter",
    "pi-vault-mind", "pi-cache-optimizer", "@gotgenes/pi-permission-system", "@narumitw/pi-usage",
    "@quandev104/pi-style", "@juicesharp/rpiv-todo", "@juicesharp/rpiv-ask-user-question",
    "@claaslange/pi-progress-bar", "@sfroment/pi-obsidian", "@0xkobold/pi-obsidian-bridge", "pi-design-deck",
]

LOCAL_SKILLS_DIR = os.path.join(AGENT_DIR, "skills")
GIT_SKILLS_DIR = os.path.join(AGENT_DIR, "git", "github.com", "GBLMX", "skin-skill", "skills")
SKILL_DIRS = [os.path.join(NPM_DIR, pkg, "skills") for pkg in PKGS] + [LOCAL_SKILLS_DIR, GIT_SKILLS_DIR]

BUILTIN_RE = re.compile(r'\{name:"([^"]+)",description:(?:"([^"]*)"|`([^`]*)`)(?:,argumentHint:"[^"]*")?\}')


def find_builtin_chunk():
    for path in glob.glob(os.path.join(CHUNK_DIR, "chunk-*.js")):
        src = io.open(path, encoding="utf-8").read()
        if "BUILTIN_SLASH_COMMANDS" in src:
            return path, src
    return None, None


def extract_builtin(src):
    out = {}
    for m in BUILTIN_RE.finditer(src):
        name = m.group(1)
        desc = m.group(2) if m.group(2) is not None else m.group(3)
        out[name] = desc
    return out


def patch_builtin(src, commands):
    """返回 (new_src, changed, missing)。"""
    changed = 0
    missing = []
    for name, info in commands.items():
        zh = info["zh"]
        pat = re.compile(r'(\{name:"' + re.escape(name) + r'",description:)(?:"[^"]*"|`[^`]*`)')
        src, n = pat.subn(lambda m: m.group(1) + json.dumps(zh, ensure_ascii=False), src)
        if n == 0:
            missing.append(name)
        else:
            changed += n
    return src, changed, missing


def patch_extensions(commands):
    """遍历 pi 包，替换 registerCommand 描述。返回 (total_changed, missing_names)。"""
    total = 0
    missing = set(commands.keys())
    for pkg in PKGS:
        base = os.path.join(NPM_DIR, pkg)
        if not os.path.isdir(base):
            continue
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs if d != "node_modules"]
            for f in files:
                if not f.endswith((".ts", ".js", ".mjs", ".cjs")) or f.endswith(".map"):
                    continue
                path = os.path.join(root, f)
                try:
                    src = io.open(path, encoding="utf-8").read()
                except Exception:
                    continue
                orig = src
                for name, info in commands.items():
                    pat = re.compile(
                        r'(registerCommand\(\s*["\']' + re.escape(name)
                        + r'["\']\s*,\s*\{[^{}]*?description\s*:\s*)'
                        + r'(?:"[^"]*"|\'[^\']*\'|`[^`]*`)',
                        re.DOTALL,
                    )
                    src, n = pat.subn(
                        lambda m: m.group(1) + json.dumps(info["zh"], ensure_ascii=False),
                        src,
                    )
                    if n:
                        missing.discard(name)
                if src != orig:
                    io.open(path, "w", encoding="utf-8").write(src)
                    total += 1
    return total, sorted(missing)


def replace_skill_description(src, zh):
    """替换 SKILL.md frontmatter 里的 description（单行或折叠块）。"""
    m = re.match(r'^---\n(.*?)\n---', src, re.DOTALL)
    if not m:
        return src, 0
    fm = m.group(1)
    new_zh = 'description: ' + json.dumps(zh, ensure_ascii=False)
    pat = re.compile(
        r'^[ \t]*description:[ \t]*(?:[>|][ \t]*\n(?:[ \t]+[^\n]*\n?)*|"[^"]*"|\'[^\']*\'|[^\n]*)',
        re.MULTILINE,
    )
    new_fm, n = pat.subn(lambda _m: new_zh, fm)
    if n == 0 or new_fm == fm:
        return src, 0
    return src.replace(fm, new_fm, 1), n


def patch_skills(commands):
    """遍历所有 skills 目录，patch SKILL.md 的 description。"""
    total = 0
    missing = set(commands.keys())
    for skills_dir in SKILL_DIRS:
        if not os.path.isdir(skills_dir):
            continue
        for root, dirs, files in os.walk(skills_dir):
            for f in files:
                if f != "SKILL.md":
                    continue
                path = os.path.join(root, f)
                try:
                    src = io.open(path, encoding="utf-8").read()
                except Exception:
                    continue
                m = re.search(r'^name:\s*([^\n]+)', src, re.MULTILINE)
                if not m:
                    continue
                name = m.group(1).strip()
                if name not in commands:
                    continue
                info = commands[name]
                missing.discard(name)
                if info.get("en") == info.get("zh"):
                    continue  # 已经是中文，无需 patch
                new_src, n = replace_skill_description(src, info["zh"])
                if n:
                    io.open(path, "w", encoding="utf-8").write(new_src)
                    total += 1
    return total, sorted(missing)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    with io.open(MAP_FILE, encoding="utf-8") as f:
        table = json.load(f)
    builtin = table.get("builtinCommands", {})
    ext = table.get("extensionCommands", {})
    skills = table.get("skillCommands", {})

    # ---- 内置命令 ----
    path, src = find_builtin_chunk()
    if path:
        current = extract_builtin(src)
        zh_values = {c["zh"] for c in builtin.values()}
        if all(current.get(name) == info["zh"] for name, info in builtin.items() if name in current):
            print("内置命令：已是中文，无需重新应用。")
        else:
            bak = path + ".bak"
            if not os.path.exists(bak):
                io.open(bak, "w", encoding="utf-8").write(src)
                print(f"内置命令：已备份英文原文 -> {os.path.basename(bak)}")
            src, changed, missing = patch_builtin(src, builtin)
            if changed:
                io.open(path, "w", encoding="utf-8").write(src)
                print(f"内置命令：已应用 {changed} 条中文 -> {os.path.basename(path)}")
            if missing:
                print(f"内置命令：警告，以下未找到（可能已移除）：{', '.join(missing)}")
    else:
        print("内置命令：未找到包含 BUILTIN_SLASH_COMMANDS 的 chunk 文件。")

    # ---- 扩展命令 ----
    files, missing = patch_extensions(ext)
    if files:
        print(f"扩展命令：已 patch {files} 个文件（{len(ext) - len(missing)} 个命令）。")
    else:
        print("扩展命令：已是中文或未找到可 patch 文件。")
    if missing:
        print(f"扩展命令：警告，以下命令未找到（可能已移除/改名）：{', '.join(missing)}")

    # ---- skill 命令 ----
    files, missing = patch_skills(skills)
    if files:
        print(f"skill 命令：已 patch {files} 个 SKILL.md（{len(skills) - len(missing)} 个 skill）。")
    else:
        print("skill 命令：已是中文或未找到可 patch 文件。")
    if missing:
        print(f"skill 命令：警告，以下 skill 未找到：{', '.join(missing)}")

    print("完成。重启 pi 生效。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
