import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./src/check";
import { runApply } from "./src/patch";
import type { CommandMap } from "./src/check";

function loadMap(): { builtin: CommandMap; extension: CommandMap; skill: CommandMap } {
  let here: string;
  try {
    here = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    here = process.cwd();
  }
  const p = path.join(here, "cn-slash-commands.json");
  const raw = fs.readFileSync(p, "utf-8");
  const d = JSON.parse(raw);
  return {
    builtin: d.builtinCommands || {},
    extension: d.extensionCommands || {},
    skill: d.skillCommands || {},
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("cn-check", {
    description: "检测 slash 命令中文映射的兼容性",
    handler: async (_args, ctx) => {
      const map = loadMap();
      const r = runCheck(map);
      ctx.ui.setWidget("cn-report", r.lines);
      ctx.ui.notify(
        r.ok ? "映射完全兼容" : "存在不兼容项，详见报告",
        r.ok ? "info" : "warning",
      );
    },
  });

  pi.registerCommand("cn-apply", {
    description: "应用 slash 命令中文描述",
    handler: async (_args, ctx) => {
      const map = loadMap();
      const r = runApply(map);
      ctx.ui.setWidget("cn-report", r.lines);
      ctx.ui.notify(
        `已应用：内置 ${r.builtinChanged} / 扩展 ${r.extFiles} 文件 / skill ${r.skillFiles} 文件`,
        "info",
      );
    },
  });
}
