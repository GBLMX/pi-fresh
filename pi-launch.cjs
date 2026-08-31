#!/usr/bin/env node
/**
 * pi-launch：启动门禁（实验性，先不部署）
 *
 * 流程：计算指纹 → 对比基线 → skip 或 check/apply → 启动 pi
 *   - 指纹一致：文件没变，直接启动 pi（快路径）
 *   - 指纹变化：check 兼容则更新基线启动；不兼容则 apply 后启动
 *
 * 用法：
 *   node pi-launch.cjs                 正常启动
 *   PI_LAUNCH_DRY_RUN=1 node pi-launch.cjs   只演练门禁，不真正启动 pi
 */
const { spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// 定位 jiti（pi 环境依赖）
const JITI_PATH = process.env.PI_JITI_PATH || "E:/pi/agent/npm/node_modules/jiti";
const { createJiti } = require(JITI_PATH);
const jiti = createJiti(__dirname, { interopDefault: true, moduleCache: false });
const { findBuiltinChunk } = jiti("./src/paths.ts");

const ROOT = __dirname;
const BASELINE = path.join(ROOT, ".baseline.json");
const MAP = path.join(ROOT, "cn-slash-commands.json");
const CLI = path.join(ROOT, "cli.cjs");

// pi 正式启动命令（部署时可配，默认从 Windows Terminal profile 提取）
const PI_NODE = process.env.PI_NODE || "C:\\Program Files\\nodejs\\node.exe";
const PI_CLI =
  process.env.PI_CLI ||
  "E:\\npm\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\bundle\\cli.js";

const DRY_RUN = !!process.env.PI_LAUNCH_DRY_RUN;

function sha256(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file, "utf-8"))
    .digest("hex")
    .slice(0, 16);
}

function fingerprint() {
  const chunk = findBuiltinChunk();
  return {
    mapHash: sha256(MAP),
    chunkHash: chunk ? sha256(chunk.path) : "missing",
  };
}

function loadBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE, "utf-8"));
  } catch {
    return null;
  }
}

function saveBaseline(fp) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ ...fp, updatedAt: new Date().toISOString() }, null, 2) + "\n",
    "utf-8",
  );
}

function matches(base, fp) {
  return !!base && base.mapHash === fp.mapHash && base.chunkHash === fp.chunkHash;
}

function runCli(cmd) {
  return spawnSync(process.execPath, [CLI, cmd], { stdio: "inherit" });
}

function launchPi() {
  if (DRY_RUN) {
    console.log(`[pi-launch] DRY-RUN：将启动 pi（${PI_NODE} ${PI_CLI}）`);
    return;
  }
  const child = spawn(PI_NODE, [PI_CLI], { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on("error", (err) => {
    console.error("[pi-launch] 启动 pi 失败:", err.message);
    process.exit(1);
  });
}

function main() {
  const fp = fingerprint();
  const base = loadBaseline();

  if (matches(base, fp)) {
    console.log("[pi-launch] 指纹一致 → SKIP → 启动 pi");
    launchPi();
    return;
  }

  console.log("[pi-launch] 指纹变化 → 检测兼容性");
  const check = runCli("check");
  if (check.status === 0) {
    console.log("[pi-launch] 兼容 → 更新基线 → 启动 pi");
    saveBaseline(fp);
    launchPi();
  } else {
    console.log("[pi-launch] 不兼容 → 重新规范化 → 启动 pi");
    runCli("apply");
    saveBaseline(fp);
    launchPi();
  }
}

main();
