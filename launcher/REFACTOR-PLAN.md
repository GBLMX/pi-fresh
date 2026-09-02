# pi-launcher 改造方案

> 基于分析：launcher 花大量代码做低频功能（配置组合、单包回退），却缺高频自救功能（bare rescue、update 后 cn-slash）。

## 0. 现状与问题

| 现状 | 问题 |
| :--- | :--- |
| `[5]` 配置组合 | 冗余：`profiles.json` 仅 1 个过时的"测试甲"（含已移除的 pi-vault-mind），~50 行代码实际使用率≈0 |
| `[4]` 回退版本 | 窄：只针对 pi-fresh 一个本地包做整套 git UI，未覆盖刚 git 化的 agent |
| 无 bare 启动 | 缺失：`E:\pi-bare\agent` 存在但无入口，global 坏了无法自救 |
| `[2]` 更新裸跑 | 缺失：`pi update` 后中文描述 patch 丢失，需手动 cn-slash |

## 1. 改造目标（新菜单）

```
[1] 启动 pi（global）
[2] 启动 bare rescue pi
[3] 更新（pi update + cn-slash 重应用）
[4] 扩展管理
[5] 版本回退（agent / pi-fresh）
[0] 退出
```

净效果：删 1 冗余项、加 1 自救项、强化 2 项。预计净减 ~45 行。

## 2. 逐项改动

### 2.1 删：配置组合（profiles）

- 删除函数：`currentProfile` / `listProfiles` / `saveProfile` / `deleteProfile` / `setDirDisabled` / `applyProfile`
- 删除状态：`profiles` / `profile-save` / `profile-delete`（含 render 与 `rl.on("line")` 分支）
- 删除常量 `PROFILES`；`profiles.json` 保留数据不动（用户可自行清理）
- **收益**：减 ~90 行，去一个实际使用率≈0 的功能

### 2.2 加：bare rescue 启动

新增 `launchBarePi()`，复用 `launchPi()` 的 spawn 逻辑，仅覆盖 env：

```js
function launchBarePi() {
  launched = true;
  rl.close();
  const env = { ...process.env, PI_CODING_AGENT_DIR: "E:\\pi-bare\\agent" };
  const child = spawn(PI_NODE, [PI_CLI], { stdio: "inherit", env });
  child.on("exit", (c, s) => process.exit(c ?? (s ? 1 : 0)));
  child.on("error", (e) => { console.error("启动 bare pi 失败:", e.message); process.exit(1); });
}
```

菜单 `[2]` 调它。**收益**：global 坏时 launcher 可自救。

### 2.3 改：更新接 cn-slash

`doUpdate()` 在 `pi update` 成功后追加 cn-slash：

```js
function doUpdate() {
  const r = spawnSync("pi", ["update"], { stdio: "inherit" });
  if (r.status !== 0) { console.log(`\npi update 失败（退出码 ${r.status}）。`); return; }
  console.log("\n重新应用中文斜杠描述 ...\n");
  spawnSync(PI_NODE, [path.join(__dirname, "..", "cn-slash", "cli.cjs"), "check"], { stdio: "inherit" });
  spawnSync(PI_NODE, [path.join(__dirname, "..", "cn-slash", "cli.cjs"), "apply"], { stdio: "inherit" });
  console.log("\n更新完成（含 cn-slash）。");
}
```

**收益**：update 后中文描述不再丢失。

### 2.4 改：回退扩展为 agent + pi-fresh

`findLocalGitPkgs()` 改为固定双目标（不再依赖 settings 的本地包探测）：

```js
const ROLLBACK_TARGETS = [
  { name: "agent", dir: AGENT_DIR },
  { name: "pi-fresh", dir: path.resolve(__dirname, "..") },
];
```

`rollback-select` 列出这两个仓库（有 `.git` 的），`rollback-version` 沿用现有 `git log` + `checkout`。
**收益**：覆盖刚 git 化的 agent（回退 skill 重构任意阶段），比回退 pi-fresh 更有用。

## 3. 分阶段执行

| 阶段 | 动作 |
| :--- | :--- |
| S1 | 删 `[5]` 配置组合（2.1） |
| S2 | 加 bare rescue（2.2）+ 更新接 cn-slash（2.3） |
| S3 | 回退扩展双目标（2.4） |
| S4 | 本地冒烟：`node pi-launcher.cjs` 走每个菜单项 |

## 4. 回退

- `E:\pi-fresh` 是 git 仓库，每阶段 commit，`git revert` 可回退。
- 删掉的 profiles 代码在 git 历史里（`profiles.json` 数据保留未删）。
