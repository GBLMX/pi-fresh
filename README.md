# pi-fresh

中文化 pi 的 slash 命令描述（内置 / 扩展 / skill），并提供 `pi update` 后的兼容检测。

覆盖三类命令的描述（命令名和 `[来源标记]` 不变，只改描述文字）：

| 类别 | 来源 | 数量 |
|---|---|---|
| 内置命令 | `BUILTIN_SLASH_COMMANDS`（bundle） | 23 |
| 扩展命令 | `registerCommand()`（npm 包） | 49 |
| skill 命令 | `SKILL.md` frontmatter（npm/local/git） | 29 |

## 两个实现

| | 版本 1：pi 包（推荐） | 版本 2：Python 脚本 |
|---|---|---|
| 位置 | 仓库根目录 | `scripts/` |
| 触发方式 | pi 里 `/cn-check`、`/cn-apply` | 命令行 `python scripts/check-cn-slash.py` |
| 依赖 | 无（Node 内嵌） | Python 3 |
| 安装 | `pi install git:github.com/GBLMX/pi-fresh` | clone 后直接跑 |

两者共享同一份映射表 `cn-slash-commands.json`。

## 版本 1：pi 包

```bash
pi install git:github.com/GBLMX/pi-fresh   # 或本地路径
# 之后在 pi 里：
/cn-check    # 检测兼容性
/cn-apply    # 应用中文化
```

## 版本 2：Python 脚本

```bash
python scripts/check-cn-slash.py    # 检测
python scripts/apply-cn-slash.py    # 应用
```

路径可用环境变量覆盖：`PI_CHUNK_DIR`、`PI_NPM_DIR`、`PI_CODING_AGENT_DIR`。

## 原理

pi 没有"本地化命令描述"的官方 API，描述在注册时写死。本方案通过
**中间层映射表 + patch 文件里的 description 字符串** 实现中文化：

- 映射表 `cn-slash-commands.json`（name -> {en, zh}）独立于 pi 版本，`pi update` 不会覆盖
- patch 按 name 匹配（不依赖英文措辞），幂等
- `en` 字段用于 update 后检测英文描述是否变化

## 工作流（pi update 之后）

1. `/cn-check`（或 `python scripts/check-cn-slash.py`）→ 看报告
2. 更新 `cn-slash-commands.json`（补翻译 / 删过时映射）
3. `/cn-apply`（或 `python scripts/apply-cn-slash.py`）→ 应用中文
4. 完全重启 pi（内置命令在 bundle，需重启生效）

## 限制

- 本质是修改第三方文件（bundle + npm 包 + SKILL.md），`pi update` 会覆盖，需重跑
- patch 内置命令后需**完全重启 pi**（bundle 是启动时加载的）
