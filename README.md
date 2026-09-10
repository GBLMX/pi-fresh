# pi-fresh

pi 的一站式本地工具集，一个 git 仓库里承载两个功能：

1. **pi 启动菜单**（`launcher/`）—— 带菜单的 pi 入口（自 2026-09-08 起不再是唯一入口；桌面 `pi.lnk` 已改走 herdr，见下）
2. **中文化 slash 命令**（`cn-slash/`）—— 把 pi 的 slash 命令描述转成中文，`pi update` 后可检测兼容性

---

## 1. pi 启动菜单（launcher）

受限菜单，只响应数字键，不是自由终端。**当前入口状态（2026-09-10）**：

WezTerm 已卸载（`wezterm-gui` 不在 PATH / 磁盘），旧 `pi.lnk`（wezterm + herdr）随之失效；Windows Terminal 成为唯一终端，herdr 走 standalone 包的 `current` junction。

| 入口 | 指向 | 说明 |
| :--- | :--- | :--- |
| 桌面 `pi-wt.lnk` | **herdr**（WT 档 `pi-herdr`，`herdr --session pi`） | 主入口；命名窗口 `pi` 复用（第二次点击是加标签页，不再开新窗口） |
| Windows Terminal 档 `pi-menu` | 本 launcher | 回退 / 自救入口 |
| Windows Terminal 档 `pi-bare` | bare pi（`PI_CODING_AGENT_DIR=E:\pi-bare\agent`） | global 坏时自救 |

```
node E:\pi-fresh\launcher\pi-launcher.cjs
```

| 键 | 功能 |
|---|---|
| `1` | 启动 pi（global，spawn `node cli.js`，stdio 继承，退出后随 pi 退出） |
| `2` | 启动 herdr（持久会话 `pi`，走 `HERDR_EXE` 或 standalone `current` junction） |
| `3` | 启动 bare rescue pi（`PI_CODING_AGENT_DIR=E:\pi-bare\agent`） |
| `4` | 启动 omp（pi 衍生版，走 `~/.omp/agent`，不继承 `PI_CODING_AGENT_DIR`） |
| `5` | 更新（`pi update` + 自动 cn-slash check/apply） |
| `6` | 扩展管理（启用 / 禁用 package / skill / extension） |
| `7` | 版本回退（agent / pi-fresh 双仓库 git checkout） |
| `0` | 退出 |

> `5` 更新必须用 `node cli.js update`（而非 `spawnSync("pi")`）：Windows 上 `pi` 解析到 npm 的 `.cmd`/`.ps1` shim，
> Node 无 shell 启动批处理会 `ENOENT`/`EINVAL`，更新会静默失败（2026-09-10 修复）。

本地状态文件（已 gitignore，不提交）：

- `launcher/disabled-packages.json` —— 被禁用的 package 列表

---

## 2. 中文化 slash 命令（cn-slash）

pi 没有「本地化命令描述」的官方 API，描述在注册时写死。本方案通过
**中间层映射表 + patch 文件里的 `description` 字符串** 实现中文化。

### 入口（共享同一套核心 `cn-slash/src/`）

| 入口 | 用法 | 场景 |
|---|---|---|
| extension 命令 | `/cn-check` `/cn-apply` | pi 内手动 |
| CLI | `node cn-slash/cli.cjs check` / `apply` / `baseline [update]` | 脚本 / wrapper |
| Python 脚本 | `python cn-slash/scripts/check-cn-slash.py` / `apply-cn-slash.py` | 无 Node 环境备用 |

> 注：旧的中文化脚本 + 映射表曾另存于 `E:\pi\agent\.pi-setup\`，
> 已重命名为 `.pi-setup.bak` 留档。映射表以本仓库 `cn-slash/cn-slash-commands.json` 为准。

### 用法

```bash
# pi 内手动
/cn-check
/cn-apply

# 或命令行（在 pi-fresh 目录下）
node cn-slash/cli.cjs check
node cn-slash/cli.cjs apply
node cn-slash/cli.cjs baseline update   # 记录 apply 后的指纹
```

### 原理

- 映射表 `cn-slash/cn-slash-commands.json`（`name -> {en, zh}`）独立于 pi 版本，`pi update` 不会覆盖
- patch 按 `name` 匹配（不依赖英文措辞），幂等
- `en` 字段用于 update 后检测英文描述是否变化
- `.baseline.json` 记录 apply 后指纹，没变就 skip

### 工作流（pi update 之后）

1. `node cn-slash/cli.cjs check`（或 `/cn-check`）→ 看报告
2. 更新 `cn-slash/cn-slash-commands.json`（补翻译 / 删过时映射）
3. `node cn-slash/cli.cjs apply`（或 `/cn-apply`）→ 应用中文
4. `node cn-slash/cli.cjs baseline update` → 更新指纹
5. 完全重启 pi（内置命令在 bundle，需重启生效）

---

## 目录结构

```
pi-fresh/
├── package.json               pi 包清单（pi.extensions = ./cn-slash/index.ts）
├── launcher/
│   ├── pi-launcher.cjs        启动菜单（唯一入口）
│   └── disabled-packages.json 禁用 package（gitignore）
├── cn-slash/
│   ├── index.ts               pi extension，注册 /cn-check /cn-apply
│   ├── cli.cjs                cn-slash CLI（check/apply/baseline）
│   ├── cn-slash-commands.json 映射表（94 个命令：23 内置 + 47 扩展 + 24 技能）
│   ├── .baseline.json         指纹基线（gitignore）
│   ├── src/
│   │   ├── check.ts           兼容性检测
│   │   ├── patch.ts           description 中文化 patch
│   │   ├── extract.ts         提取英文描述
│   │   └── paths.ts           路径 / 包清单常量（可用环境变量覆盖）
│   └── scripts/
│       ├── apply-cn-slash.py  Python 版应用（备用）
│       └── check-cn-slash.py  Python 版检测（备用）
├── .gitignore
└── README.md
```

### 路径可覆盖（框架 / 移植）

`cn-slash/src/paths.ts` 里所有路径默认指向本机环境，可用环境变量覆盖，便于移植到别的 pi 环境：

```
PI_CODING_AGENT_DIR    pi agent 目录（默认 E:\pi\agent）
PI_NPM_DIR             npm 包目录
PI_CHUNK_DIR           bundle chunk 目录
PI_JITI_PATH           jiti 依赖路径
```

launcher 自身的可覆盖项（`launcher/pi-launcher.cjs` 顶部）：

```
PI_NODE      node 解释器（默认 E:\nodejs\node.exe）
PI_CLI       pi bundle cli.js 路径
OMP_BUN      omp 的 bun.exe 路径
OMP_CLI      omp 的 cli.js 路径
HERDR_EXE    herdr.exe 路径（默认 ~/.herdr/packages/standalone/current/herdr.exe）
```

---

## 限制

- 本质是修改第三方文件（bundle + npm 包 + SKILL.md），`pi update` 会覆盖，需重跑
- patch 内置命令后需**完全重启 pi**（bundle 是启动时加载的）
