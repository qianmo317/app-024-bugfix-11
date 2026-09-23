# 元宵灯谜库 · Lantern Riddle Bank

> 类型：纯前端 Web 应用｜技术栈：**React 18 + TypeScript + Vite**（手写 CSS，不引入 UI 库；运行时依赖仅 `react` / `react-dom`，见 `package.json:14-17`）

## 1. 一句话简介
把一场元宵灯会的谜条从建库、按谜格校验、批量出条打印，到现场按谜号登记与兑奖号码生成，全部收在一个纯浏览器、断网可用的工具里完成。

## 2. 真实场景与痛点
- 社区、工会、学校办灯会，谜条动辄几十上百条：素材散在 Word、Excel 与纸条里，重号、重谜只能靠人眼对。
- 灯谜有「格」：秋千格要倒读、徐妃格要各字同旁去半、梨花格要整条谐音。出题人未必记得全规则，把不合格的谜挂出去，懂谜的人一眼看出。
- 谜条要印出来挂灯笼：字号、每页条数、裁切线、回收联都得在 Word 里手工摆；300 条约 50 页，改一条就要重排。
- 现场兑奖靠纸笔：同一个谜号被两个人报到，当场发现不了；活动结束统计「猜中多少、发了多少奖」只能事后数纸。

## 3. 目标用户
- 社区 / 工会 / 学校负责元宵活动的干事（一人兼出题、排版、现场）。
- 灯谜社团的组织者与出题人（需要按格自查谜条）。
- 图书馆、文化馆的活动执行人员（现场断网、多人轮班登记）。

## 4. 核心功能（MVP）
1. **谜库管理**：谜面、谜底、谜目（6 类）、谜格（9 种）、谜格补充说明、作者、出处、难度（1~3 星）、适用年龄、标签、备注；谜号自动取 `max(no)+1`（`store.ts:89-91`）。
2. **谜格校验**：`validateRiddle(surface, answer, category, format, ctx)` 一格一条规则，输出 `verdict`（通过 / 存疑 / 不通过）＋ `reasons`（`validate.ts:28-188`）。通用部分校验谜目字数：猜一字应 1 字、成语应 4 字（`validate.ts:50-55`）。
3. **重复检测**：谜面归一化后算相似度，同谜目且 ≥ 0.85 判重（`duplicates.ts:5`）；编辑页实时列候选，列表页可全库扫描并列出相似对。
4. **出条打印**：按选定范围生成 A4 谜条，卡片尺寸与每页条数可配（4/6/8/9/12 条，`PrintPage.tsx:52`），带裁切线，支持「同页双联回收联」（谜号 + 谜底 + 猜中者填写栏）与主办方落款；超出版面自动缩小并给出告警文案（`print.ts:45-47`）。
5. **现场登记**：大输入框按谜号登记「猜中者 / 奖项 / 备注」（`Onsite.tsx:110-121`），重复登记当场拦截；长按 0.6 秒快速登记（用第一个奖项，`Onsite.tsx:63-70`）；实时统计总数 / 已猜中 / 剩余 / 奖品发放（`store.ts:241-249`）；兑奖号码按登记时间顺序从 `DJ-0001` 起生成（`store.ts:215-227`）。
6. **导入导出**：谜库与登记表导出 UTF-8 with BOM 的 CSV（`csv.ts:44`，Excel 打开不乱码）；导入走两步式预览，分为新增 / 重复 / 格式错误三类，确认后才写库（`csv.ts:121-173`）。

## 5. 进阶功能
- 多维筛选 + 全文搜索：谜目、谜格、难度、校验结果、标签五个下拉加一个搜索框；搜索覆盖谜面 / 谜底 / 作者 / 出处 / 谜号 / 标签，中文查询额外走归一化（去标点、繁转简，`search.ts:27-37`）。
- 现场大屏模式：全屏逐条大字显示谜号与谜面，三级提示「谜底字数 → 首字 → 拼音首字母」（`Onsite.tsx:225-227`，拼音取离线数据包每个字的首个读音首字母）。
- 谜格说明页：9 种格各一张卡片，给出规则简述、示例，以及该格「能自动判定什么」（`Library.tsx:7-17`、`FORMAT_AUTO_CAPABILITY`）。
- 离线优先：谜库、登记、设置全部存 IndexedDB，断网可继续登记，顶栏显示离线徽标（`App.tsx:48`）；无 IndexedDB 的环境自动降级为内存 Map（`idb.ts:35-40`）。
- 设置页：活动名称 / 主办方 / 日期、打印默认参数、奖品预设增删、重新校验全部谜格、清空谜库与登记（`Settings.tsx`）。

## 6. 页面结构
手写 hash 路由，无 react-router（`router.ts:13-24`）：

```
#/                谜库列表：筛选 / 搜索 / 50 条一页 / 勾选批量出条 / 导入导出 / 全库查重
#/riddle/:id      谜条编辑：表单 + 实时校验面板 + 重复提示（id 为 new 时是新建）
#/print           出条打印：版式参数、实时预览、裁切线、同页双联
#/onsite          现场登记：按谜号登记、统计、兑奖号码、大屏模式
#/library         谜格说明与示例
#/settings        活动信息、打印默认、奖品预设、数据管理
```

## 7. 数据模型
```ts
// src/types.ts:10-59（节选）
type Riddle = {
  id: string; no: number;             // 谜号：现场对号、谜条大字
  surface: string; answer: string;
  category: 'char'|'object'|'idiom'|'place'|'person'|'other';
  format: 'none'|'qiqian'|'juanlian'|'xufei'|'lihua'|'baitou'|'fendi'|'shanglou'|'xialou';
  formatNote?: string; author?: string; source?: string; note?: string;
  difficulty: 1|2|3; ageGroup?: 'child'|'teen'|'adult'|'all'; tags: string[];
  check: { verdict: 'pass'|'suspect'|'fail'; reasons: string[]; checkedAt: number };
};
type OnsiteRecord = { id: string; riddleId: string; winnerName?: string; winnerRef?: string;
                      prize: string; at: number; note?: string; code?: string };
type EventInfo    = { id: string; title: string; host: string; date: string; riddleIds: string[] };
type PrintSetup   = { cardWmm: number; cardHmm: number; perPage: number;
                      showAnswerSlip: boolean; showCutLine: boolean; hostLine: string };
type AppSettings  = { event: EventInfo; print: PrintSetup; prizes: string[] };
```
默认值：卡片 63×135mm、每页 6 条、双联与裁切线默认开、奖项 `['参与奖','三等奖','二等奖','一等奖']`（`store.ts:10-18`）。

离线数据包（`public/data/`，与页面同源 fetch，不发外部请求）：

| 文件 | 规模 | 用途 |
|---|---|---|
| `pinyin.json` | 20924 字拼音（多音字为数组） | 谐音格候选、大屏拼音提示、多音字提醒 |
| `components.json` | 7770 字 `[部首形, 去旁余部, 归一组键]` | 徐妃格判同旁并给出去旁读法 |
| `common.json` | 9534 常用字（Make Me a Hanzi 收录字集） | 生僻字检测的代理 |

生成脚本 `scripts/gen-data.mjs` 读本地文本行输出三个 JSON；示例谜库 `public/samples/riddles.csv` 共 53 条（10 条误例、11 条谜格示例、2 条生僻字、1 条多音字用例）。

## 8. 关键算法与实现点
- **谜格规则引擎**：`validateRiddle` 对 9 种格各写一条规则。字数硬约束直接判 fail——秋千格 2 字、卷帘 / 上楼 / 下楼 ≥3 字、徐妃 / 梨花 / 白头 / 粉底 ≥2 字（`validate.ts:77-184`）。可自动判定的部分给确定结论：徐妃格用部件数据比较「归一组键」，偏旁不一判 fail，同旁则给出 `去「艹」旁读作「夫容」`（`validate.ts:107-114`）；梨花 / 白头 / 粉底从同音索引取候选（去声调，`datafiles.ts:43,52-60`）。语义扣合一律 suspect 并写明「语义对应无法自动判定」——`suspect()` 只在没有 fail 时生效，因此绝不误报 pass（`validate.ts:39-41,187`）。无格时另做生僻字（≥2 个 suspect、1 个仅提示）与多音字提示（`validate.ts:62-72`）。
- **重复检测**：`normalizeText` 先按一张约 100 余对的繁→简字表逐字映射，再用 `/[\s\p{P}\p{S}]+/gu` 去掉空白、标点与符号，最后小写（`normalize.ts:3-20`）；`levenshtein` 带 `max` 提前剪枝，某行最小值超过 max 立即返回 `max+1`（`normalize.ts:23-42`）。`findSimilar` 先按长度差预筛，相似度 `1 - dist / max(len)`，达阈值降序取前 5（`duplicates.ts:14-36`）；`scanDuplicates` 全库两两比对并双向登记结果（`duplicates.ts:39-63`）。
- **A4 排版计算**：常量 A4 210×297mm、页边距 10mm、卡间距 4mm（`print.ts:4-7`）；先把 `perPage` 钳到 1~12，再枚举列数 1~6、行数 `ceil(want/cols)`，取「卡片面积最大」的组合，卡片尺寸取配置值与可用区均分的较小值；被缩小时置 `adjusted` 并生成告警文案（`print.ts:29-62`）。
- **离线数据加载**：`loadDataCtx(BASE_URL)` 并行 fetch 三个 JSON，任一失败不抛错，而是记 `loadError` 并保持 `loaded=false`，顶栏显示「校验数据未加载」（`datafiles.ts:17-36`、`App.tsx:50-52`）。谐音索引惰性构建，按 `DataCtx` 用 WeakMap 缓存（`validate.ts:13-18`）。
- **CSV 解析**：状态机支持 BOM、CRLF、引号内逗号 / 换行 / 双引号转义（`csv.ts:9-33`），导出统一 `\r\n` 行尾（`csv.ts:39`）。导入预览对「文件内重复」与「与库内重复」分别判定，后者先查归一化全等、再按同谜目算相似度（`csv.ts:140-172`）。
- **状态管理**：单例 class + `useSyncExternalStore`（`store.ts:35-57`、`router.ts:44-46`），写操作先改内存、再落 IndexedDB、后 emit；`saveRiddle` 保存时同步重算谜格校验并写 `checkedAt`（`store.ts:94-116`）。
- **性能**：筛选与查重都写成纯函数便于基准测试，2000 条谜库的带条件筛选、空筛选全量返回、单条查重均有 < 100ms 断言（`perf.test.ts:23,33,41`）；打印预览对第 3 页之后的 `.sheet` 用 `content-visibility: auto` 降低渲染开销（`PrintPage.tsx:83`）。

## 9. 交互与视觉要点
- 灯会主题：中国红 `#b8232f` + 暖黄 `#f0b429` + 米白纸底（`styles.css:2-15`）；顶栏红色渐变，选中导航项为金字。
- 校验结果一律「图标 + 文字」：`✓ 通过 / ？存疑 / ✕ 不通过`（`types.ts:74-80`、`bits.tsx:6-13`），列表徽标与校验面板都不靠颜色单独传达信息。
- 谜条以黑白打印为优先：卡片纯白底、谜号 26pt、谜面 14pt、谜目与落款 9.5~10.5pt，打印媒体下强制 `color: #000`（`styles.css:216-244`）。
- 现场页面向单手快速操作：谜号输入框 24px 居中、按钮用 `btn-lg`、当前谜条谜号 52px（`styles.css:167-178`）；输入框自动聚焦（`Onsite.tsx:30`），回车即查找（`Onsite.tsx:119`）。
- 大屏模式全屏深红径向渐变，谜号 110px、谜面 54px、提示 30px（`styles.css:184-196`），容器带 `role="dialog"`。
- 移动端：编辑页在 860px 以下由 3:2 双栏改单栏（`styles.css:153-154`）。
- 打印时隐藏顶栏、页脚、工具条与页面标题，每张 `.sheet` 后强制分页、最后一页不分页（`styles.css:232-244`）。

## 10. 验收标准
- **单元测试 106 例全通过**：谜格校验 49、CSV 25、重复检测 13、打印版式 9、离线数据 7、性能 3（`npx vitest run` 输出 `Tests 106 passed`）。
- **E2E 19 例**覆盖：导入示例 53 条（预览显示「新增 53 / 格式错误 0」）→ 校验徽标（秋千格正例存疑、误例不通过、无格正例通过）→ 批量选 3 条出条（`.sheet` 1 页、`.card` 3 张、回收联含「猜中者姓名」、谜面计算字号 ≥ 18.5px ≈ 14pt）→ 现场登记与重复登记提示 → 兑奖号码 `DJ-0001` → 谜库导出 CSV 断言前三字节 `EF BB BF` → 300 条谜条 = 50 页 × 6 条且首卡 `data-no=1`、末卡 `data-no=300` → 断网登记 3 条后直接读 IndexedDB 计数为 3、刷新后仍在 → 全程 console 无 error（`tests/e2e/app.spec.ts`）。
- **性能**：2000 条谜库带条件筛选、空筛选全量返回、单条查重均 < 100ms（`tests/perf.test.ts`）。
- **排版**：每页 6 条 = 3 列 × 2 行、9 条 = 3 列 × 3 行、12 条不越界、`perPage=0` 钳为 1、63×135mm 在 6 条/页时宽度受限自动缩小并告警、超大卡片缩小后不超 A4 可用区（`tests/print-layout.test.ts`）。
- **离线**：断网下完成「登记 → 刷新 → 记录仍在」。
- **打印**：A4 实际打印后按裁切线裁开，上联挂出、下联回收；谜面字号 ≥ 14pt（浏览器实测 18.66px）。

## 11. 边界（刻意不做）
不做在线猜谜答题与排行榜、不做投票问卷与开奖抽奖系统、不做电商兑奖与积分商城、不做社交分享与活动社区，也不做多人协同与云端同步——核心只做**谜库管理 + 谜格校验 + 谜条打印 + 现场登记**。

### 已知实现边界
- README「测试」表写「谜格校验 48 例」，实际 `tests/validate.test.ts` 为 **49 例**（`README.md:144`）；单元测试总数 106 与 E2E 19 与代码一致。
- README 写「重新生成：`node scripts/gen-data.mjs`（源数据 URL 见脚本注释）」，但脚本注释只有数据源名（pinyin-data、Make Me a Hanzi）没有 URL，且脚本从 `process.argv[2]/[3]` 读本地文本文件、本身不下载数据（`scripts/gen-data.mjs:1-9`）。
- `npm test` 即 `vitest run`，项目没有 vitest 配置文件，默认 include 会把 `tests/e2e/app.spec.ts` 一并收集，该文件收集失败使整条命令以**退出码 1**结束（106 个单元用例本身全通过）。
- **镜像内不含 `nginx.conf`**：`.dockerignore` 排除了它（`.dockerignore:12`），Dockerfile 只拷 `dist/`（`Dockerfile:11`），配置靠 compose 只读卷挂载（`docker-compose.yml:9`）。脱离 compose 直接 `docker run` 该镜像时用的是 nginx 默认配置，没有 `/healthz`、SPA 回退与 gzip 策略。
- `OnsiteRecord.winnerRef` 与登记表 CSV 的「联系方式」列存在（`types.ts:31`、`Settings.tsx:38`），但现场登记页没有该输入项，导出时该列恒为空。
- `EventInfo.riddleIds` 会被维护（删谜条时过滤、清空时置空，`store.ts:151,159`），但没有任何界面往里添加，活动清单始终是空数组。
- `store.loadSample()` 已实现但无调用方（`store.ts:165-167`），示例谜库只能从谜库页手动导入 CSV。
- README 的「镜像体积约 22MB」「构建上下文约 0.9MB」未在代码中体现，需实际 `docker build` 才能核实，本次未构建。

## 12. 容器化与构建（Docker）

本项目交付以容器内运行结果为准。

- **Dockerfile（两阶段）**：`node:20-alpine` 中 `npm ci` + `npm run build`（= `tsc --noEmit && vite build`）→ `nginx:1.27-alpine-slim`，只把 `/app/dist` 拷到 `/usr/share/nginx/html`，`EXPOSE 80`，镜像内置 `HEALTHCHECK` 用 `wget -qO- http://127.0.0.1/healthz`（`Dockerfile:1-15`）。
- **docker-compose.yml**：服务名 `app-024`，镜像 `app-024-lantern-riddle:latest`，容器名 `app-024`，端口 **`8104:80`**，`restart: unless-stopped`，把 `./nginx.conf` 只读挂到 `/etc/nginx/conf.d/default.conf`，健康检查 `wget -qO- http://127.0.0.1/healthz`（interval 30s / timeout 3s / retries 3）（`docker-compose.yml:1-15`）。
- **nginx.conf**：`location = /healthz` 直接 `return 200 'ok'`；`/assets/` 加 `Cache-Control: public, max-age=31536000, immutable`；`index.html` no-cache；gzip level 6、最小 256 字节，覆盖 js/css/json/svg/plain；其余路径 `try_files $uri $uri/ /index.html`（`nginx.conf:8-23`）。
- 无后端、无外部请求：拼音 / 部件 / 常用字数据与示例 CSV 随包发布，断网可用。

```bash
cd app-024
docker compose up -d --build
curl http://localhost:8104/healthz      # ok
docker compose down
```

验收：浏览器打开 `http://localhost:8104`，走通「导入示例 CSV → 编辑页看校验徽标 → 勾选批量出条 → 打印预览裁切线与双联 → 现场登记并生成 DJ-xxxx → 导出谜库 / 登记表 CSV（BOM）」；`docker compose ps` 显示 healthy；断网刷新后谜库与登记仍在（IndexedDB）。

### 忽略文件（.dockerignore / .gitignore）

- `.dockerignore` 排除 `node_modules`、`dist`、`.git`、`.env*`、`coverage`、`tests`、`playwright.config.ts`、`test-results`、`playwright-report`、`nginx.conf`、`Dockerfile`、`README.md`（`.dockerignore:1-18`）；`public/data/` 与 `public/samples/` 必须保留。
- `.gitignore` 排除 `node_modules/`、`dist/`、`.env*`、`*.log`、`coverage/`、`.vscode/`、`.idea/`，另外把真实活动数据排除：`events/`、`onsite/`、`exports/`、`*猜中者*.csv`、`*登记表*.csv`（`.gitignore:11-15`）。
- 自检：构建上下文不含 `node_modules` 与 `dist`；`git status` 不出现导出的事件数据与个人名单 CSV。
