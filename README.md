# pi-fresh

中文化 pi 的 slash 命令描述（内置 / 扩展 / skill），提供 `pi update` 后的兼容检测。
是「Pi 体验统一化配置」项目的第一个落地模块。

---

## 两个版本

本项目同时区分**两个版本**，边界清晰：

### 单一 pi 版（现在要用的）

绑定当前这台机器、这一个 pi 环境的开箱即用版本：

- 默认路径指向当前环境（`E:/pi/agent`、`E:/npm/node_modules`）
- 映射表 `cn-slash-commands.json` 是当前的 101 个命令
- 转化规则就是「我现在要的习惯」

### 框架版（要开发的）

抽象出来的通用核心，不绑定具体环境：

- `src/` 核心逻辑（check/apply/baseline），路径全部可用环境变量覆盖
- `cli.cjs` 通用 CLI 入口
- 可扩展到其他 target（工具描述、报错文案、默认设置……）
- 可移植到其他机器 / 其他 pi 环境

**区分的关键**：单一 pi 版 = 框架版 + 「当前环境的默认配置 + 当前映射表」。框架版没有硬编码路径（除 jiti 定位，用 `PI_JITI_PATH` 覆盖），单一 pi 版有默认值。

---

## 三个入口（共享同一套核心）

```
        ┌─────────────────────────┐
        │  核心逻辑（check/apply） │   src/check.ts + src/patch.ts
        └───────────┬─────────────┘
   ┌────────────────┼──────────────────┐
   │                │                  │
CLI 入口         extension 命令      skill（待做）
pi 外 wrapper     pi 内手动          agent 自主
node cli.cjs      /cn-check          pi-normalize
check/apply       /cn-apply
```

| 入口 | 用法 | 场景 |
|---|---|---|
| CLI | `node cli.cjs check` / `apply` / `baseline [update]` | wrapper 启动门禁、脚本 |
| extension 命令 | `/cn-check` `/cn-apply` | pi 内手动 |
| Python 脚本 | `python scripts/check-cn-slash.py` | 无 Node 环境时备用 |

---

## 用法

### 单一 pi 版

```bash
# 安装
pi install E:/pi-fresh

# pi 内手动
/cn-check
/cn-apply

# 或命令行
node cli.cjs check
node cli.cjs apply
node cli.cjs baseline update   # 记录 apply 后的指纹
```

### 框架版（开发/移植）

通过环境变量覆盖路径（不绑定当前环境）：

```bash
export PI_CODING_AGENT_DIR=/path/to/agent
export PI_NPM_DIR=/path/to/npm/node_modules
export PI_CHUNK_DIR=/path/to/bundle/chunks
export PI_JITI_PATH=/path/to/jiti
node cli.cjs check
```

---

## 原理

pi 没有"本地化命令描述"的官方 API，描述在注册时写死。本方案通过
**中间层映射表 + patch 文件里的 description 字符串** 实现中文化：

- 映射表 `cn-slash-commands.json`（name -> {en, zh}）独立于 pi 版本，`pi update` 不会覆盖
- patch 按 name 匹配（不依赖英文措辞），幂等
- `en` 字段用于 update 后检测英文描述是否变化
- `.baseline.json` 记录 apply 后指纹，没变就 skip（见 projects.md 的指纹基线机制）

## 工作流（pi update 之后）

1. `node cli.cjs check`（或 `/cn-check`）→ 看报告
2. 更新 `cn-slash-commands.json`（补翻译 / 删过时映射）
3. `node cli.cjs apply`（或 `/cn-apply`）→ 应用中文
4. `node cli.cjs baseline update` → 更新指纹
5. 完全重启 pi（内置命令在 bundle，需重启生效）

## 限制

- 本质是修改第三方文件（bundle + npm 包 + SKILL.md），`pi update` 会覆盖，需重跑
- patch 内置命令后需**完全重启 pi**（bundle 是启动时加载的）
