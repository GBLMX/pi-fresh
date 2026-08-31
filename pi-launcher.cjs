#!/usr/bin/env node
/**
 * pi-launcher：pi 启动菜单（launcher）
 *
 * 受限菜单：只响应菜单键，不是自由终端。
 *   [1] 启动 pi  [2] 更新  [3] 扩展管理  [4] 回退版本  [5] 配置组合  [0] 退出
 *
 * 配置组合：把当前扩展启用/禁用状态存为命名组合，一键切换。
 */
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || "E:/pi/agent";
const SETTINGS = path.join(AGENT_DIR, "settings.json");
const SKILLS_DIR = path.join(AGENT_DIR, "skills");
const EXT_DIR = path.join(AGENT_DIR, "extensions");
const DISABLED = path.join(__dirname, "disabled-packages.json");
const PROFILES = path.join(__dirname, "profiles.json");

const PI_NODE = process.env.PI_NODE || "C:\\Program Files\\nodejs\\node.exe";
const PI_CLI =
  process.env.PI_CLI ||
  "E:\\npm\\node_modules\\@earendil-works\\pi-coding-agent\\dist\\bundle\\cli.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// ---------- 工具 ----------
function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return fallback;
  }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}
function readDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

// ---------- 扩展清单 ----------
function listExtensions() {
  const settings = readJson(SETTINGS, { packages: [] });
  const enabledPkgs = settings.packages || [];
  const disabledPkgs = readJson(DISABLED, []);
  const items = [];

  for (const p of enabledPkgs) items.push({ kind: "package", name: p, enabled: true });
  for (const p of disabledPkgs) items.push({ kind: "package", name: p, enabled: false });

  for (const d of readDir(SKILLS_DIR)) {
    if (d.startsWith(".")) continue;
    const full = path.join(SKILLS_DIR, d);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const isDisabled = d.endsWith(".disabled");
    if (!fs.existsSync(path.join(full, "SKILL.md"))) continue;
    items.push({
      kind: "skill",
      name: isDisabled ? d.slice(0, -".disabled".length) : d,
      enabled: !isDisabled,
      path: full,
    });
  }

  for (const f of readDir(EXT_DIR)) {
    if (f.startsWith(".")) continue;
    const full = path.join(EXT_DIR, f);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    const isDisabled = f.endsWith(".disabled");
    const name = isDisabled ? f.slice(0, -".disabled".length) : f;
    const isFileExt = st.isFile() && (f.endsWith(".ts") || f.endsWith(".disabled"));
    const isDirExt = st.isDirectory() && fs.existsSync(path.join(full, "index.ts"));
    if (isFileExt || isDirExt) {
      items.push({ kind: "extension", name, enabled: !isDisabled, path: full });
    }
  }

  return items;
}

function toggleExtension(item) {
  if (item.kind === "package") {
    const settings = readJson(SETTINGS, { packages: [] });
    let pkgs = settings.packages || [];
    let disabled = readJson(DISABLED, []);
    if (item.enabled) {
      pkgs = pkgs.filter((p) => p !== item.name);
      disabled.push(item.name);
    } else {
      disabled = disabled.filter((p) => p !== item.name);
      pkgs.push(item.name);
    }
    settings.packages = pkgs;
    writeJson(SETTINGS, settings);
    writeJson(DISABLED, [...new Set(disabled)]);
    return `${item.name} 已${item.enabled ? "禁用" : "启用"}`;
  }
  const newPath = item.enabled ? item.path + ".disabled" : item.path.slice(0, -".disabled".length);
  fs.renameSync(item.path, newPath);
  return `${item.name} 已${item.enabled ? "禁用" : "启用"}`;
}

// ---------- 配置组合 ----------
function currentProfile() {
  const settings = readJson(SETTINGS, { packages: [] });
  const disabledPkgs = readJson(DISABLED, []);
  const disabledSkills = readDir(SKILLS_DIR)
    .filter((f) => f.endsWith(".disabled"))
    .map((f) => f.slice(0, -".disabled".length));
  const disabledExtensions = readDir(EXT_DIR)
    .filter((f) => f.endsWith(".disabled"))
    .map((f) => f.slice(0, -".disabled".length));
  return {
    packages: settings.packages || [],
    disabledPackages: disabledPkgs,
    disabledSkills,
    disabledExtensions,
  };
}

function listProfiles() {
  return readJson(PROFILES, {});
}

function saveProfile(name) {
  const profiles = listProfiles();
  profiles[name] = currentProfile();
  writeJson(PROFILES, profiles);
}

function deleteProfile(name) {
  const profiles = listProfiles();
  delete profiles[name];
  writeJson(PROFILES, profiles);
}

function setDirDisabled(dir, disabledNames) {
  // 先全部启用（去掉 .disabled），再禁用组合里标记的
  for (const f of readDir(dir)) {
    if (f.endsWith(".disabled")) {
      try {
        fs.renameSync(path.join(dir, f), path.join(dir, f.slice(0, -".disabled".length)));
      } catch {}
    }
  }
  for (const name of disabledNames) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) {
      try {
        fs.renameSync(target, target + ".disabled");
      } catch {}
    }
  }
}

function applyProfile(name) {
  const profiles = listProfiles();
  const p = profiles[name];
  if (!p) return false;
  const settings = readJson(SETTINGS, {});
  settings.packages = p.packages || [];
  writeJson(SETTINGS, settings);
  writeJson(DISABLED, p.disabledPackages || []);
  setDirDisabled(SKILLS_DIR, p.disabledSkills || []);
  setDirDisabled(EXT_DIR, p.disabledExtensions || []);
  return true;
}

// ---------- 功能 ----------
function launchPi() {
  console.log("\n正在启动 pi ...\n");
  const child = spawn(PI_NODE, [PI_CLI], { stdio: "inherit", env: process.env });
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  child.on("error", (e) => {
    console.error("启动 pi 失败:", e.message);
    process.exit(1);
  });
}

function doUpdate() {
  console.log("\n运行 pi update ...\n");
  const r = spawnSync("pi", ["update"], { stdio: "inherit" });
  if (r.status === 0) console.log("\npi update 完成。");
  else console.log(`\npi update 失败（退出码 ${r.status}）。`);
}

function findLocalGitPkgs() {
  const settings = readJson(SETTINGS, { packages: [] });
  const settingsDir = path.dirname(SETTINGS);
  const result = [];
  for (const p of settings.packages || []) {
    if (p.startsWith("npm:") || p.startsWith("git:")) continue;
    const abs = path.resolve(settingsDir, p);
    if (fs.existsSync(path.join(abs, ".git"))) result.push({ name: p, dir: abs });
  }
  return result;
}

function gitLog(dir) {
  const r = spawnSync("git", ["-C", dir, "log", "--oneline", "-20"], { encoding: "utf-8" });
  return r.status === 0 ? r.stdout.trim().split("\n").filter(Boolean) : [];
}

// ---------- 状态机 + render ----------
let state = "main"; // main | ext | rollback-select | rollback-version | profiles | profile-save | profile-delete
let rollbackSelected = null;
let rollbackLogs = [];

function render() {
  if (state === "main") {
    console.log("\n======== pi launcher ========");
    console.log(" [1] 启动 pi");
    console.log(" [2] 更新（pi update）");
    console.log(" [3] 扩展管理");
    console.log(" [4] 回退版本");
    console.log(" [5] 配置组合");
    console.log(" [0] 退出");
    process.stdout.write("选择: ");
  } else if (state === "ext") {
    const items = listExtensions();
    const kinds = { package: "包", skill: "技能", extension: "扩展" };
    console.log("\n======== 扩展管理 ========");
    items.forEach((it, i) => {
      console.log(` [${i + 1}] ${it.enabled ? "[启用]" : "[禁用]"} ${kinds[it.kind]}  ${it.name}`);
    });
    console.log(" [0] 返回主菜单");
    process.stdout.write("选择编号: ");
  } else if (state === "rollback-select") {
    const pkgs = findLocalGitPkgs();
    console.log("\n======== 回退版本 ========");
    if (pkgs.length === 0) {
      console.log(" 没有可回退的本地 git 包");
      process.stdout.write("按回车返回: ");
      return;
    }
    pkgs.forEach((p, i) => console.log(` [${i + 1}] ${p.name}  (${p.dir})`));
    console.log(" [0] 返回");
    process.stdout.write("选择包: ");
  } else if (state === "rollback-version") {
    console.log(`\n${rollbackSelected.name} 的 git 历史（最近 ${rollbackLogs.length} 条）:`);
    rollbackLogs.forEach((l, i) => console.log(` [${i + 1}] ${l}`));
    console.log(" [0] 返回");
    process.stdout.write("选择要回退到的版本: ");
  } else if (state === "profiles") {
    const profiles = listProfiles();
    const names = Object.keys(profiles);
    console.log("\n======== 配置组合 ========");
    if (names.length === 0) {
      console.log(" （无已保存组合）");
    } else {
      console.log(" 已保存组合：");
      names.forEach((n, i) => console.log(`   [${i + 1}] ${n}`));
    }
    console.log(" [N] 保存当前为组合   [D] 删除组合   [0] 返回");
    process.stdout.write("选择: ");
  } else if (state === "profile-save") {
    process.stdout.write("\n输入组合名字: ");
  } else if (state === "profile-delete") {
    const names = Object.keys(listProfiles());
    console.log("\n删除组合：");
    names.forEach((n, i) => console.log(`   [${i + 1}] ${n}`));
    console.log(" [0] 取消");
    process.stdout.write("选择: ");
  }
}

rl.on("line", (line) => {
  const a = line.trim();

  if (state === "main") {
    if (a === "1") return launchPi();
    if (a === "2") doUpdate();
    else if (a === "3") state = "ext";
    else if (a === "4") {
      rollbackSelected = null;
      state = "rollback-select";
    } else if (a === "5") state = "profiles";
    else if (a === "0") {
      console.log("退出。");
      process.exit(0);
    } else console.log(" 无效选择");
  } else if (state === "ext") {
    if (a === "0" || a === "") {
      state = "main";
    } else {
      const items = listExtensions();
      const idx = parseInt(a, 10) - 1;
      if (idx >= 0 && idx < items.length) console.log("  ->", toggleExtension(items[idx]));
      else console.log("  无效编号");
    }
  } else if (state === "rollback-select") {
    const pkgs = findLocalGitPkgs();
    if (pkgs.length === 0) {
      state = "main";
      render();
      return;
    }
    if (a === "0" || a === "") {
      state = "main";
    } else {
      const idx = parseInt(a, 10) - 1;
      if (idx >= 0 && idx < pkgs.length) {
        rollbackSelected = pkgs[idx];
        rollbackLogs = gitLog(pkgs[idx].dir);
        state = "rollback-version";
      } else console.log("  无效编号");
    }
  } else if (state === "rollback-version") {
    if (a === "0" || a === "") {
      rollbackSelected = null;
      state = "rollback-select";
    } else {
      const idx = parseInt(a, 10) - 1;
      if (idx >= 0 && idx < rollbackLogs.length) {
        const hash = rollbackLogs[idx].split(/\s+/)[0];
        const r = spawnSync("git", ["-C", rollbackSelected.dir, "checkout", hash], { stdio: "inherit" });
        if (r.status === 0) {
          console.log(`\n已回退 ${rollbackSelected.name} 到 ${hash}。`);
          console.log("注意：现在是 detached HEAD，可用 git checkout master 回到最新。");
        } else {
          console.log("回退失败。");
        }
        rollbackSelected = null;
        state = "rollback-select";
      } else console.log("  无效编号");
    }
  } else if (state === "profiles") {
    const profiles = listProfiles();
    const names = Object.keys(profiles);
    if (a === "0" || a === "") {
      state = "main";
    } else if (a.toLowerCase() === "n") {
      state = "profile-save";
    } else if (a.toLowerCase() === "d") {
      state = "profile-delete";
    } else {
      const idx = parseInt(a, 10) - 1;
      if (idx >= 0 && idx < names.length) {
        if (applyProfile(names[idx])) console.log(`  已切换到组合「${names[idx]}」`);
        else console.log("  应用失败");
      } else console.log("  无效选择");
    }
  } else if (state === "profile-save") {
    if (a === "") {
      state = "profiles";
    } else {
      saveProfile(a);
      console.log(`  已保存组合「${a}」`);
      state = "profiles";
    }
  } else if (state === "profile-delete") {
    const names = Object.keys(listProfiles());
    if (a === "0" || a === "") {
      state = "profiles";
    } else {
      const idx = parseInt(a, 10) - 1;
      if (idx >= 0 && idx < names.length) {
        deleteProfile(names[idx]);
        console.log(`  已删除组合「${names[idx]}」`);
        state = "profiles";
      } else console.log("  无效编号");
    }
  }

  render();
});

render();
