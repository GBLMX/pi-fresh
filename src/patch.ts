import * as fs from "node:fs";
import * as path from "node:path";
import { findBuiltinChunk, skillDirs, walkSourceFiles, walkSkillMdFiles, PKGS, npmDir } from "./paths";
import { extractSkillName, extractSkillDescription, extractBuiltin } from "./extract";
import type { CommandMap } from "./check";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patchBuiltin(
  content: string,
  commands: CommandMap,
): { content: string; changed: number; missing: string[] } {
  let changed = 0;
  const missing: string[] = [];
  for (const [name, info] of Object.entries(commands)) {
    const re = new RegExp(
      `(\\{name:"${escapeRe(name)}",description:)(?:"[^"]*"|\`[^\`]*\`)`,
      "g",
    );
    let n = 0;
    const next = content.replace(re, (_m, p1) => {
      n++;
      return p1 + JSON.stringify(info.zh);
    });
    if (n === 0) missing.push(name);
    else {
      changed += n;
      content = next;
    }
  }
  return { content, changed, missing };
}

function patchExtensions(commands: CommandMap): { files: number; missing: string[] } {
  const missing = new Set(Object.keys(commands));
  let files = 0;
  for (const pkg of PKGS) {
    const base = path.join(npmDir, pkg);
    if (!fs.existsSync(base)) continue;
    for (const f of walkSourceFiles(base)) {
      let src: string;
      try {
        src = fs.readFileSync(f, "utf-8");
      } catch {
        continue;
      }
      const orig = src;
      for (const [name, info] of Object.entries(commands)) {
        const re = new RegExp(
          `(registerCommand\\(\\s*["']${escapeRe(name)}["']\\s*,\\s*\\{[^{}]*?description\\s*:\\s*)(?:"[^"]*"|'[^']*'|\`[^\`]*\`)`,
          "gs",
        );
        src = src.replace(re, (_m, p1) => {
          missing.delete(name);
          return p1 + JSON.stringify(info.zh);
        });
      }
      if (src !== orig) {
        fs.writeFileSync(f, src, "utf-8");
        files++;
      }
    }
  }
  return { files, missing: [...missing].sort() };
}

function replaceSkillDescription(src: string, zh: string): { content: string; changed: boolean } {
  const m = /^---\n(.*?)\n---/s.exec(src);
  if (!m) return { content: src, changed: false };
  const fm = m[1];
  const newZh = "description: " + JSON.stringify(zh);
  const re =
    /^[ \t]*description:[ \t]*(?:[>|][ \t]*\n(?:[ \t]+[^\n]*\n?)*|"(?:[^"\\]|\\.)*"|'[^']*'|[^\n]*)/gm;
  const newFm = fm.replace(re, () => newZh);
  if (newFm === fm) return { content: src, changed: false };
  return { content: src.replace(fm, newFm), changed: true };
}

function patchSkills(commands: CommandMap): { files: number; missing: string[] } {
  const missing = new Set(Object.keys(commands));
  let files = 0;
  for (const dir of skillDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const f of walkSkillMdFiles(dir)) {
      let src: string;
      try {
        src = fs.readFileSync(f, "utf-8");
      } catch {
        continue;
      }
      const name = extractSkillName(src);
      if (!name || !(name in commands)) continue;
      const info = commands[name];
      missing.delete(name);
      if (info.en === info.zh) continue; // 已经是中文，无需 patch
      const r = replaceSkillDescription(src, info.zh);
      if (r.changed) {
        fs.writeFileSync(f, r.content, "utf-8");
        files++;
      }
    }
  }
  return { files, missing: [...missing].sort() };
}

export interface ApplyResult {
  lines: string[];
  builtinChanged: number;
  extFiles: number;
  skillFiles: number;
}

export function runApply(map: {
  builtin: CommandMap;
  extension: CommandMap;
  skill: CommandMap;
}): ApplyResult {
  const lines: string[] = [];
  let builtinChanged = 0;
  let extFiles = 0;
  let skillFiles = 0;

  // 内置命令
  const chunk = findBuiltinChunk();
  if (!chunk) {
    lines.push("内置命令：未找到 BUILTIN_SLASH_COMMANDS chunk。");
  } else {
    const builtin = extractBuiltin(chunk.content);
    const allZh = Object.entries(map.builtin).every(
      ([n, i]) => !builtin.has(n) || builtin.get(n) === i.zh,
    );
    if (allZh) {
      lines.push("内置命令：已是中文，无需重新应用。");
    } else {
      const bak = chunk.path + ".bak";
      if (!fs.existsSync(bak)) {
        fs.writeFileSync(bak, chunk.content, "utf-8");
        lines.push(`内置命令：已备份英文原文 -> ${path.basename(bak)}`);
      }
      const r = patchBuiltin(chunk.content, map.builtin);
      if (r.changed) {
        fs.writeFileSync(chunk.path, r.content, "utf-8");
        lines.push(`内置命令：已应用 ${r.changed} 条中文 -> ${path.basename(chunk.path)}`);
        builtinChanged = r.changed;
      }
      if (r.missing.length) lines.push(`内置命令：警告，未找到：${r.missing.join(", ")}`);
    }
  }

  // 扩展命令
  const ext = patchExtensions(map.extension);
  extFiles = ext.files;
  lines.push(
    ext.files
      ? `扩展命令：已 patch ${ext.files} 个文件（${Object.keys(map.extension).length - ext.missing.length} 个命令）。`
      : "扩展命令：已是中文或未找到可 patch 文件。",
  );
  if (ext.missing.length) lines.push(`扩展命令：警告，未找到：${ext.missing.join(", ")}`);

  // skill 命令
  const sk = patchSkills(map.skill);
  skillFiles = sk.files;
  lines.push(
    sk.files
      ? `skill 命令：已 patch ${sk.files} 个 SKILL.md（${Object.keys(map.skill).length - sk.missing.length} 个 skill）。`
      : "skill 命令：已是中文或未找到可 patch 文件。",
  );
  if (sk.missing.length) lines.push(`skill 命令：警告，未找到：${sk.missing.join(", ")}`);

  lines.push("完成。重启 pi 生效。");
  return { lines, builtinChanged, extFiles, skillFiles };
}
