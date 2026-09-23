# 元宵灯谜库 · Lantern Riddle Bank

> 纯前端 Web 应用 ｜ 技术栈：**React 18 + TypeScript + Vite**（手写 CSS，不引入 UI 库）
>
> 管灯谜库、按谜格检查谜面谜底是否成立、批量打印可裁剪的谜条（含谜号与谜底回收联）、现场登记与发奖统计——办一场灯会用一套工具全搞定。

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [Docker 部署](#docker-部署)
- [页面结构](#页面结构)
- [谜格校验能力说明](#谜格校验能力说明)
- [数据与持久化](#数据与持久化)
- [测试](#测试)
- [项目结构](#项目结构)
- [边界（刻意不做）](#边界刻意不做)

## 功能特性

### 核心（MVP）

| 模块 | 说明 |
|---|---|
| 谜库管理 | 谜面、谜目（猜一字/一物/成语/地名/人名/其他）、谜底、谜格、作者出处、难度（1~3 星）、适用年龄、标签、备注；**重复检测**（谜面归一化后编辑距离，同谜目相似度 ≥85% 提示） |
| 谜格校验 | 9 种常见谜格规则引擎（详见[下文](#谜格校验能力说明)）；结果分「通过 / 存疑 / 不通过」，存疑项说明原因；无格谜只做基础校验 |
| 出条打印 | 批量选谜生成谜条：谜号大字、谜面 ≥14pt、谜目与谜格说明、主办方落款、**同页双联回收联**（谜号 + 谜底 + 猜中者填写栏）；A4 每页 4~12 条，带裁切线，超版自动缩小并告警；支持排除重复谜面出条 |
| 现场登记 | 大输入框按谜号登记「谁猜中、奖项、时间」；**重复登记提示**；长按快速登记；实时统计已猜中/剩余/奖品发放；兑奖号码生成（DJ-xxxx，仅生成号码不做在线抽奖） |
| 导出 / 导入 | 谜库 CSV、现场登记表 CSV 导出（**UTF-8 with BOM**，Excel 打开不乱码）；CSV 两步式导入预览（新增 / 重复 / 格式错误分类） |

### 进阶

- 难度、谜目、谜格、校验结果、标签多维筛选与全文搜索（繁简/标点归一化）
- 现场大屏模式：逐条大字显示谜面，**分级提示**（字数 → 首字 → 拼音首字母），不做记分与排行榜联网
- 离线优先：全部数据存 IndexedDB，现场无网可用；断网时顶栏显示离线徽标

## 快速开始

环境要求：Node.js ≥ 20

```bash
cd app-024
npm install        # 安装依赖
npm run dev        # 开发服务器 http://localhost:5104
npm run build      # 类型检查 + 生产构建（输出 dist/）
npm run preview    # 本地预览生产构建
npm test           # 运行单元测试（vitest）
npm run e2e        # 运行 E2E 测试（Playwright，自动拉起 preview 服务）
```

> 首次进入应用为空库，可在「谜库」页点击 **导入 CSV** 并选择 [public/samples/riddles.csv](public/samples/riddles.csv)（53 条示例，覆盖各类谜格正例与误例），或直接新建谜条。

## Docker 部署

多阶段构建（`node:20-alpine` 构建 → `nginx:1.27-alpine-slim` 运行），无后端依赖，**断网可用**。

```bash
cd app-024
docker compose up -d --build
curl http://localhost:8104/healthz     # 返回 ok
docker compose down
```

| 项目 | 值 |
|---|---|
| 服务名 / 端口 | `app-024`，`8104:80`，`restart: unless-stopped` |
| 镜像体积 | 约 22MB（< 60MB 目标） |
| 构建上下文 | 约 0.9MB（`.dockerignore` 排除 node_modules/dist/tests 等） |
| nginx 配置 | SPA 回退；`/assets/` immutable；`index.html` no-cache；gzip 开启；`/healthz` 探针 |
| 离线数据 | `public/data/`（拼音/部件/常用字）与 `public/samples/` 打包进镜像，**不要 ignore** |

## 页面结构

手写 hash 路由（无 react-router）：

| 路由 | 页面 |
|---|---|
| `#/` | 谜库列表：筛选/搜索/分页（50 条/页）/勾选批量出条/导入导出/全库查重 |
| `#/riddle/:id` | 谜条编辑：表单 + 实时谜格校验面板 + 重复提示（`new` 为新建） |
| `#/print` | 谜条打印：版式参数、实时预览、裁切线、同页双联 |
| `#/onsite` | 现场登记：登记、统计、兑奖号码、大屏模式 |
| `#/library` | 谜格说明与示例（含能力边界） |
| `#/settings` | 活动信息、打印默认参数、奖品预设、数据管理 |

## 谜格校验能力说明

校验实现为**规则集而非字符串比较**：每格一条规则，输入 `(谜面, 谜底, 谜目)`，输出 `verdict + reasons`。能力边界诚实——能自动判定的给出确定结论，**语义扣合无法自动判定的一律标「存疑」并说明原因，绝不误报「通过」**。

| 谜格 | 规则 | 自动判定 | 存疑边界 |
|---|---|---|---|
| 无格 | 谜底直扣谜面 | 字数与谜目匹配、生僻字（≥2 个判存疑）、多音字提示 | — |
| 秋千格 | 谜底限两字，倒读扣面 | 字数须为两字；展示倒读结果 | 倒读后语义扣合 |
| 卷帘格 | 谜底 ≥3 字，倒序读 | 字数须 ≥3 字；展示倒序结果 | 倒序后语义扣合 |
| 徐妃格 | 各字同旁去半边读 | 内置部件数据判各字是否同旁、给出去旁读法 | 去旁后语义扣合 |
| 梨花格 | 每字均读谐音 | 字数、内置拼音数据给谐音候选（含多音字） | 谐音后对应关系 |
| 白头格 | 首字读谐音 | 字数、首字谐音候选 | 扣合语义 |
| 粉底格 | 末字读谐音 | 字数、末字谐音候选 | 扣合语义 |
| 上楼格 | 末字移至最前读（≥3 字） | 字数、移字读法 | 扣合语义 |
| 下楼格 | 首字移至末尾读（≥3 字） | 字数、移字读法 | 扣合语义 |

通用规则：无论有无谜格，均校验「猜一字应 1 字、成语应 4 字」等谜目字数匹配。

## 数据与持久化

### 数据模型（摘要）

```ts
type Riddle = {
  id: string; no: number;           // 谜号（现场对号、谜条大字）
  surface: string; answer: string;  // 谜面 / 谜底
  category: 'char'|'object'|'idiom'|'place'|'person'|'other';
  format: 'none'|'qiqian'|'juanlian'|'xufei'|'lihua'|'baitou'|'fendi'|'shanglou'|'xialou';
  difficulty: 1|2|3; ageGroup?: 'child'|'teen'|'adult'|'all';
  tags: string[];
  check: { verdict: 'pass'|'suspect'|'fail'; reasons: string[]; checkedAt: number };
};
type OnsiteRecord = { riddleId: string; winnerName?: string; prize: string; at: number; code?: string };
type PrintSetup   = { cardWmm: number; cardHmm: number; perPage: number; showAnswerSlip: boolean; showCutLine: boolean; hostLine: string };
```

### 存储与离线数据包

- 应用数据（谜库 / 登记记录 / 设置）全部存 **IndexedDB**，刷新与断网均不丢失；隐私模式下自动降级为内存存储
- 拼音、部件、常用字离线数据随包发布于 `public/data/`，同源加载、**不请求外部接口**：

| 文件 | 内容 |
|---|---|
| `pinyin.json` | 20924 字拼音（含多音字，如 `["zhong4","chong2"]`） |
| `components.json` | 7770 字部件拆分（`[部首形, 去旁余部, 归一组键]`），徐妃格判同旁用 |
| `common.json` | 9534 常用字表，生僻字检测代理（如 `燚`/`龘` 不在表内） |

- 重新生成：`node scripts/gen-data.mjs`（源数据 URL 见脚本注释）
- 示例谜库：`public/samples/riddles.csv`（53 条，含各类谜格正例/误例/生僻字/多音字用例）

## 测试

```bash
npm test     # 单元测试（vitest）
npm run e2e  # 端到端测试（Playwright）
```

| 测试 | 覆盖 | 结果 |
|---|---|---|
| 单元测试 106 例 | 谜格校验 48 例（各格正例/误例/跨检查组合、生僻字、多音字）、重复检测（不同标点判重/繁简归一/阈值以下不误报）、CSV 解析导出与导入预览、打印版式（6/9/12 条/页、超版告警）、**性能（2000 条筛选 <100ms）**、离线数据包集成 | 全部通过 |
| E2E 19 例 | 导入→校验→出条→登记→导出全流程、搜索筛选、批量出条打印预览（双联/裁切线/14pt 谜面）、现场登记与重复登记提示、大屏分级提示、兑奖号码、CSV 导出 BOM 字节断言、设置持久化、**300 张谜条 50 页无错位**、**离线登记落库不丢**、控制台零报错、错误路由容错 | 全部通过 |

## 项目结构

```
app-024/
├── index.html                  # 入口 HTML
├── package.json                # react / react-dom（运行时仅此两项）
├── vite.config.ts              # port 5104、base './'
├── tsconfig.json               # strict 模式
├── playwright.config.ts        # E2E 配置（自动拉起 preview）
├── Dockerfile                  # 多阶段：node 构建 → nginx 运行
├── docker-compose.yml          # app-024 服务，8104:80
├── nginx.conf                  # SPA 回退 / gzip / healthz / 缓存策略
├── scripts/
│   └── gen-data.mjs            # 离线数据包生成脚本
├── public/
│   ├── data/                   # 拼音 / 部件 / 常用字（勿 ignore）
│   └── samples/riddles.csv     # 示例谜库（53 条）
├── src/
│   ├── main.tsx                # 入口：store.init + render
│   ├── App.tsx                 # 顶栏 / 导航 / 离线徽标 / 路由分发
│   ├── styles.css              # 灯会主题（中国红+暖黄）+ 打印样式（@page A4）
│   ├── types.ts                # 数据模型与标签映射
│   ├── lib/
│   │   ├── store.ts            # 集中式状态（useSyncExternalStore 模式）
│   │   ├── idb.ts              # IndexedDB 轻封装（内存降级）
│   │   ├── validate.ts         # 谜格校验规则引擎
│   │   ├── duplicates.ts       # 重复检测（归一化 + 剪枝编辑距离）
│   │   ├── normalize.ts        # 归一化与编辑距离
│   │   ├── search.ts           # 筛选/搜索（2000 条 <100ms）
│   │   ├── csv.ts              # CSV 解析/导出/导入预览（BOM）
│   │   ├── print.ts            # A4 排版计算
│   │   ├── datafiles.ts        # 离线数据包加载 + 谐音索引
│   │   └── format.ts           # 日期/星级/下载工具
│   ├── ui/
│   │   ├── router.ts           # 手写 hash 路由
│   │   └── bits.tsx            # 校验徽标 / 难度星
│   └── pages/                  # 六页面：RiddleList / RiddleEdit / PrintPage
│                               #        Onsite / Library / Settings
└── tests/
    ├── *.test.ts               # 单元测试（vitest）
    └── e2e/app.spec.ts         # E2E（Playwright）
```

## 边界（刻意不做）

不做在线猜谜答题与排行榜、不做投票问卷与抽奖开奖系统、不做电商兑奖与积分商城、不做社交分享——核心只做**谜库管理 + 谜格校验 + 谜条打印 + 现场登记**。

## 交互与视觉要点

- 灯会主题配色（中国红 + 暖黄），谜条以黑字为主，**黑白打印清晰**
- 谜号大号数字，谜面字号 ≥ 14pt
- 校验结果用「图标 + 文字」（✓ 通过 / ？存疑 / ✕ 不通过），不单靠颜色
- 现场登记页大按钮 + 大输入框；断网顶栏显示离线徽标
