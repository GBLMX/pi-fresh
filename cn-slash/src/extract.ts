import * as fs from "node:fs";
import * as path from "node:path";
import { findBuiltinChunk, skillDirs, walkSourceFiles, walkSkillMdFiles, PKGS, npmDir } from "./paths";

const BUILTIN_RE =
  /\{name:"([^"]+)",description:(?:"([^"]*)"|`([^`]*)`)(?:,argumentHint:"[^"]*")?\}/g;

const EXT_RE =
  /registerCommand\(\s*["']([^"']+)["']\s*,\s*\{[^{}]*?description\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/gs;

export type DescMap = Map<string, string>;

export function extractBuiltin(src: string): DescMap {
  const out = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = BUILTIN_RE.exec(src))) {
    out.set(m[1], m[2] ?? m[3] ?? "");
  }
  return out;
}

export function extractExtensions(src: string): DescMap {
  const out = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = EXT_RE.exec(src))) {
    out.set(m[1], m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

export function extractSkillDescription(src: string): string | null {
  const folded =
    /^[ \t]*description:[ \t]*[>|][ \t]*\n((?:[ \t]+[^\n]*\n?)+)/m.exec(src);
  if (folded) {
    const lines = folded[1].match(/[ \t]*([^\n]+)/g) ?? [];
    return lines.map((l) => l.trim()).filter(Boolean).join(" ");
  }
  const single =
    /^[ \t]*description:[ \t]*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\n]*))/m.exec(src);
  if (single) {
    const v = single[1] ?? single[2] ?? single[3] ?? "";
    return v.replace(/\\"/g, '"').trim();
  }
  return null;
}

export function extractSkillName(src: string): string | null {
  const m = /^name:\s*([^\n]+)/m.exec(src);
  return m ? m[1].trim() : null;
}

/** 收集当前所有命令的 name -> description（内置/扩展/skill 三类） */
export function collectAll(): {
  builtin: DescMap;
  extension: DescMap;
  skill: DescMap;
  chunkPath: string | null;
} {
  const builtin = new Map<string, string>();
  let chunkPath: string | null = null;
  const chunk = findBuiltinChunk();
  if (chunk) {
    chunkPath = chunk.path;
    for (const [n, d] of extractBuiltin(chunk.content)) builtin.set(n, d);
  }

  const extension = new Map<string, string>();
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
      for (const [n, d] of extractExtensions(src)) extension.set(n, d);
    }
  }

  const skill = new Map<string, string>();
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
      const desc = extractSkillDescription(src);
      if (name && desc !== null) skill.set(name, desc);
    }
  }

  return { builtin, extension, skill, chunkPath };
}
