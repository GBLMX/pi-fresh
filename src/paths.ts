import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

/** pi agent 目录（全局配置根） */
export const agentDir =
  process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");

/** npm 包安装目录 */
export const npmDir =
  process.env.PI_NPM_DIR || path.join(agentDir, "npm", "node_modules");

/** 含 registerCommand 的 pi 包（按 name 全局替换） */
export const PKGS = [
  "pi-subagents", "pi-lens", "pi-powerline-footer", "pi-web-access", "pi-mcp-adapter",
  "pi-vault-mind", "pi-cache-optimizer", "@gotgenes/pi-permission-system", "@narumitw/pi-usage",
  "@quandev104/pi-style", "@juicesharp/rpiv-todo", "@juicesharp/rpiv-ask-user-question",
  "@claaslange/pi-progress-bar", "@sfroment/pi-obsidian", "@0xkobold/pi-obsidian-bridge", "pi-design-deck",
];

/** 内置命令所在 bundle 目录的候选路径 */
export function bundleDirCandidates(): string[] {
  const candidates: string[] = [];
  if (process.env.PI_CHUNK_DIR) candidates.push(process.env.PI_CHUNK_DIR);
  candidates.push("E:/npm/node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks");
  candidates.push(path.join(npmDir, "@earendil-works", "pi-coding-agent", "dist", "bundle", "chunks"));
  return candidates;
}

/** 找到包含 BUILTIN_SLASH_COMMANDS 的 chunk 文件 */
export function findBuiltinChunk(): { path: string; content: string } | null {
  for (const dir of bundleDirCandidates()) {
    if (!fs.existsSync(dir)) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (f.startsWith("chunk-") && f.endsWith(".js") && !f.endsWith(".bak")) {
        const p = path.join(dir, f);
        let content: string;
        try {
          content = fs.readFileSync(p, "utf-8");
        } catch {
          continue;
        }
        if (content.includes("BUILTIN_SLASH_COMMANDS")) return { path: p, content };
      }
    }
  }
  return null;
}

/** 遍历所有需要 patch/check 的文件（.ts/.js/.mjs/.cjs，排除 .map） */
export function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|js|mjs|cjs)$/.test(e.name) && !e.name.endsWith(".map")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** 遍历目录下所有 SKILL.md 文件 */
export function walkSkillMdFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "SKILL.md") out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** 遍历所有 skill 目录（npm 包 / local / git） */
export function skillDirs(): string[] {
  const dirs: string[] = [];
  for (const pkg of PKGS) dirs.push(path.join(npmDir, pkg, "skills"));
  dirs.push(path.join(agentDir, "skills"));
  const gitBase = path.join(agentDir, "git");
  if (fs.existsSync(gitBase)) {
    const walk = (d: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const p = path.join(d, e.name);
        if (e.name === "skills") dirs.push(p);
        else walk(p);
      }
    };
    walk(gitBase);
  }
  return dirs;
}
