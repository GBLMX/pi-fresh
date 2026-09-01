#!/usr/bin/env node
/**
 * pi-fresh CLI 入口（框架能力，供 wrapper 门禁 / 手动 / skill 共用）
 *
 * 用法:
 *   node cli.js check    检测兼容性（退出码 0=兼容 1=不兼容）
 *   node cli.js apply    应用中文化转化
 *   node cli.js baseline 查看/更新指纹基线
 */
const path = require("node:path");
const fs = require("node:fs");

// 定位 jiti（pi 环境依赖），优先环境变量
const JITI_PATH =
  process.env.PI_JITI_PATH || "E:/pi/agent/npm/node_modules/jiti";
const { createJiti } = require(JITI_PATH);
const jiti = createJiti(__dirname, { interopDefault: true, moduleCache: false });

const { runCheck } = jiti("./src/check.ts");
const { runApply } = jiti("./src/patch.ts");

const MAP_PATH = path.join(__dirname, "cn-slash-commands.json");
const BASELINE_PATH = path.join(__dirname, ".baseline.json");

function loadMap() {
  const d = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"));
  return {
    builtin: d.builtinCommands || {},
    extension: d.extensionCommands || {},
    skill: d.skillCommands || {},
  };
}

function baseline(action) {
  if (action === "update") {
    const b = {
      piVersion: process.env.PI_VERSION || "",
      mapHash: "",
      chunkHash: "",
    };
    // 用 check 逻辑拿到 chunk 路径 + 映射表 hash
    const crypto = require("node:crypto");
    const { findBuiltinChunk } = jiti("./src/paths.ts");
    const chunk = findBuiltinChunk();
    b.mapHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(MAP_PATH, "utf-8"))
      .digest("hex")
      .slice(0, 16);
    if (chunk) {
      b.chunkHash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(chunk.path, "utf-8"))
        .digest("hex")
        .slice(0, 16);
    }
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(b, null, 2) + "\n", "utf-8");
    console.log("基线已更新 ->", BASELINE_PATH);
    console.log(JSON.stringify(b, null, 2));
    return 0;
  }
  if (fs.existsSync(BASELINE_PATH)) {
    console.log(fs.readFileSync(BASELINE_PATH, "utf-8"));
  } else {
    console.log("无基线（先跑 apply 再跑 baseline update）");
  }
  return 0;
}

const cmd = process.argv[2];
const sub = process.argv[3];

if (cmd === "check") {
  const r = runCheck(loadMap());
  console.log(r.lines.join("\n"));
  process.exit(r.ok ? 0 : 1);
} else if (cmd === "apply") {
  const r = runApply(loadMap());
  console.log(r.lines.join("\n"));
  process.exit(0);
} else if (cmd === "baseline") {
  process.exit(baseline(sub));
} else {
  console.log("用法: node cli.js <check|apply|baseline [update]>");
  process.exit(2);
}
