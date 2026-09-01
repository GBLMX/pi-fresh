import { collectAll, type DescMap } from "./extract";

interface CommandInfo {
  en: string;
  zh: string;
}
export type CommandMap = Record<string, CommandInfo>;

function checkSection(
  title: string,
  current: DescMap,
  commands: CommandMap,
): { lines: string[]; ok: boolean } {
  const lines: string[] = [
    `── ${title} ──`,
    `映射 ${Object.keys(commands).length} 个 / 当前 ${current.size} 个`,
  ];

  const newCmds: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ n: string; old: string; now: string }> = [];
  const notApplied: string[] = [];

  for (const n of current.keys()) if (!(n in commands)) newCmds.push(n);
  for (const n of Object.keys(commands)) if (!current.has(n)) removed.push(n);
  for (const [n, desc] of current) {
    if (!(n in commands)) continue;
    const { en, zh } = commands[n];
    if (desc === zh) continue;
    if (desc === en) notApplied.push(n);
    else changed.push({ n, old: en, now: desc });
  }

  if (newCmds.length) {
    lines.push(`[新增] ${newCmds.length} 个命令需补翻译:`);
    for (const n of newCmds) lines.push(`    /${n}: ${current.get(n)}`);
  } else lines.push("[新增] 无");

  if (removed.length) {
    lines.push(`[移除] ${removed.length} 个映射已过时:`);
    for (const n of removed) lines.push(`    /${n}`);
  } else lines.push("[移除] 无");

  if (changed.length) {
    lines.push(`[描述变化] ${changed.length} 个命令英文描述已改变，请核对中文翻译:`);
    for (const c of changed) {
      lines.push(`    /${c.n}:`);
      lines.push(`        旧: ${c.old}`);
      lines.push(`        新: ${c.now}`);
      lines.push(`        中: ${commands[c.n].zh}`);
    }
  } else lines.push("[描述变化] 无");

  if (notApplied.length) {
    lines.push(`[未应用] ${notApplied.length} 个命令仍是英文原文，需运行 /cn-apply:`);
    for (const n of notApplied) lines.push(`    /${n}`);
  } else lines.push("[未应用] 无");

  lines.push("");
  return { lines, ok: !(newCmds.length || removed.length || changed.length) };
}

export function runCheck(map: { builtin: CommandMap; extension: CommandMap; skill: CommandMap }): {
  lines: string[];
  ok: boolean;
} {
  const { builtin, extension, skill } = collectAll();
  const header = ["slash 命令中文映射兼容检测", "".repeat(50).replace(/./g, "="), ""];
  const b = checkSection("内置命令 (BUILTIN_SLASH_COMMANDS)", builtin, map.builtin);
  const e = checkSection("扩展命令 (registerCommand)", extension, map.extension);
  const s = checkSection("skill 命令 (SKILL.md)", skill, map.skill);
  const ok = b.ok && e.ok && s.ok;
  const tail = ["=".repeat(50), ok ? "✓ 映射表与当前版本完全兼容。" : "✗ 存在不兼容项。更新 cn-slash-commands.json 后重跑 /cn-apply。"];
  return { lines: [...header, ...b.lines, ...e.lines, ...s.lines, ...tail], ok };
}
