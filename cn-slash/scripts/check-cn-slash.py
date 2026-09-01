#!/usr/bin/env python3
"""检测 pi 更新后 slash 命令（内置 + 扩展）与中文映射表的兼容性。

建议在 `pi update` 之后、重新应用中文之前运行。报告四类问题：

  1. 新增命令  —— 当前有、映射表没有，需补中文翻译
  2. 移除命令  —— 映射表有、当前没有，映射已过时
  3. 描述变化  —— 同名命令的英文描述变了，中文翻译可能需更新
  4. 未应用    —— 当前仍是英文原文（与映射表 en 一致），需跑 apply

用法:
    python E:/pi/agent/.pi-setup/check-cn-slash.py
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
EXT_RE = re.compile(
    r'registerCommand\(\s*["\']([^"\']+)["\']\s*,\s*\{[^{}]*?description\s*:\s*(?:"([^"]*)"|\'([^\']*)\'|`([^`]*)`)',
    re.DOTALL,
)


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


def extract_extensions():
    """遍历 pi 包提取 registerCommand 的 name -> description（按 name 去重）。"""
    out = {}
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
                for m in EXT_RE.finditer(src):
                    name = m.group(1)
                    desc = m.group(2) or m.group(3) or m.group(4) or ""
                    out.setdefault(name, desc)
    return out


def check_section(title, current, commands):
    """比对当前描述与映射表，打印报告，返回是否完全兼容。"""
    print(f"── {title} ──")
    print(f"映射 {len(commands)} 个 / 当前 {len(current)} 个")

    zh_map = {n: c["zh"] for n, c in commands.items()}
    en_map = {n: c["en"] for n, c in commands.items()}

    new_cmds = [n for n in current if n not in commands]
    removed_cmds = [n for n in commands if n not in current]
    changed = []
    not_applied = []
    for n, cur_desc in current.items():
        if n not in commands:
            continue
        if cur_desc == zh_map[n]:
            continue  # 已应用
        if cur_desc == en_map[n]:
            not_applied.append(n)  # 英文未变，未应用
        else:
            changed.append((n, en_map[n], cur_desc))

    if new_cmds:
        print(f"[新增] {len(new_cmds)} 个命令需补翻译:")
        for n in new_cmds:
            print(f"    /{n}: {current[n]}")
    else:
        print("[新增] 无")

    if removed_cmds:
        print(f"[移除] {len(removed_cmds)} 个映射已过时:")
        for n in removed_cmds:
            print(f"    /{n}")
    else:
        print("[移除] 无")

    if changed:
        print(f"[描述变化] {len(changed)} 个命令英文描述已改变，请核对中文翻译:")
        for n, old_en, new_en in changed:
            print(f"    /{n}:")
            print(f"        旧: {old_en}")
            print(f"        新: {new_en}")
            print(f"        中: {zh_map[n]}")
    else:
        print("[描述变化] 无")

    if not_applied:
        print(f"[未应用] {len(not_applied)} 个命令仍是英文原文，需跑 apply-cn-slash.py:")
        for n in not_applied:
            print(f"    /{n}")
    else:
        print("[未应用] 无")

    print()
    return not (new_cmds or removed_cmds or changed)


def extract_skill_description(src):
    """提取 SKILL.md frontmatter 的 description（单行或折叠块，规范化成单行）。"""
    # 折叠块优先
    m = re.search(r'^[ \t]*description:[ \t]*[>|][ \t]*\n((?:[ \t]+[^\n]*\n?)+)', src, re.MULTILINE)
    if m:
        lines = re.findall(r'[ \t]*([^\n]+)', m.group(1))
        return ' '.join(l.strip() for l in lines if l.strip())
    # 单行（带引号或裸标量）
    m = re.search(r'^[ \t]*description:[ \t]*(?:"((?:[^"\\]|\\.)*)"|\'([^\']*)\'|([^\n]*))', src, re.MULTILINE)
    if m:
        v = m.group(1) or m.group(2) or m.group(3) or ''
        return v.replace('\\"', '"').strip()
    return None


def extract_skills():
    """遍历所有 skills 目录，提取 SKILL.md 的 name -> description。"""
    out = {}
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
                desc = extract_skill_description(src)
                if desc is not None:
                    out[name] = desc
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    with io.open(MAP_FILE, encoding="utf-8") as f:
        table = json.load(f)
    builtin = table.get("builtinCommands", {})
    ext = table.get("extensionCommands", {})
    skills = table.get("skillCommands", {})

    print("=" * 62)
    print("slash 命令中文映射兼容检测")
    print("=" * 62)
    print()

    ok_builtin = True
    path, src = find_builtin_chunk()
    if path:
        ok_builtin = check_section("内置命令 (BUILTIN_SLASH_COMMANDS)", extract_builtin(src), builtin)
    else:
        print("── 内置命令 ── 未找到 chunk 文件\n")

    ok_ext = check_section("扩展命令 (registerCommand)", extract_extensions(), ext)

    ok_skills = check_section("skill 命令 (SKILL.md)", extract_skills(), skills)

    print("=" * 62)
    if ok_builtin and ok_ext and ok_skills:
        print("✓ 映射表与当前版本完全兼容。")
    else:
        print("✗ 存在不兼容项。更新 cn-slash-commands.json 后重跑 apply-cn-slash.py。")
    print("=" * 62)
    return 0 if (ok_builtin and ok_ext and ok_skills) else 1


if __name__ == "__main__":
    raise SystemExit(main())
