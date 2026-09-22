# 如何读取 DSH 会话上下文 / token 用量

> **写于 2026-09-22**。适用对象：任何想回答"这条对话用了多少上下文"的 AI 会话。
> 本文档自包含，照抄即可。

---

## 一、先说结论：AI **看不到**自己的上下文用量

这不是工具限制，是**接口事实**：

- LLM API 的响应里**不包含** token 计数反馈给你
- DSH 也**没有**把用量暴露成工具（没有 `get_usage` 这类工具）
- 所以**任何"我大概用了 N 万 token"的说法都是猜测**，在长对话里误差极大

**但 DSH 自己要把用量显示给用户，所以它一定记录了。去它的存储里读。**

---

## 二、数据在哪里

### 主存储：session projcache（**这是你要的**）

```
C:\Users\10766\.dsh\storages\session_projcache\sessions\session-<UUID>.json
```

一个会话一个文件。**它就是 DSH UI 上显示的用量数据源。**

### 旁路存储：会话原始记录（**通常读不出来，见坑 2**）

```
C:\Users\10766\.dsh\sessions\<项目目录名转义>\session-<UUID>\session.v3.jsonl.zstd
```

目录名是工作区路径的转义形式，例如：

```
--D-~65B0~5EFA~6587~4EF6~5939-ai_text--      ← D:\新建文件夹\ai_text
```

（`~` + 大写十六进制 = 转义后的非 ASCII 字符）

---

## 三、可用的字段（projcache）

结构：`{ version, record: { identity, rows } }`

在 `record.rows` 下：

| 字段 | 内容 |
|---|---|
| **`tokenUsage`** | `.totals` 累计用量 + `.last` 最近一次调用 |
| **`contextPressure`** | **当前上下文占用（关键）** |
| **`contextBreakdown`** | 上下文由哪些节点构成（逐条 tokens） |
| **`sessionStats`** | 轮次 / 步骤 / 耗时统计 |
| `title` / `goal` / `turnOutline` / `turnBoundary` | 会话元信息 |

每个字段都是 `{ ver, seq, val }`，**真正的值在 `.val`**。

### 关键字段详解

**`tokenUsage`**
```js
{
  totals: {
    uncachedInputTokens,   // 未命中缓存的输入
    outputTokens,          // 输出（模型生成）
    cacheReadTokens,       // 缓存命中的输入读取 ← 通常极大
    cacheWriteTokens
  },
  last: { turn, step, buckets: {...} }   // 最近一次调用
}
```

**`contextPressure`** ← **回答"上下文用了多少"就用这个**
```js
{
  surfaceTokens,        // 当前实际装载进上下文的 tokens
  contextWindow,        // 上下文窗口上限（实测 1000000）
  pressureTokens,       // 压力值（通常 > surfaceTokens）
  sampledSurfaceTokens  // 采样值
}
```

**`contextBreakdown`**
```js
{ nodes: [ { seq, heuristicTokens, system: true|false, ... }, ... ] }
```
- `nodes.length` = 上下文里的节点条数
- `system === true` 的是系统提示
- 按 `heuristicTokens` 降序即为"最大的几块"

**`sessionStats`**
```js
{
  turns, steps,
  llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens,
  lastTurn, openStep
}
```

---

## 四、可用脚本

把下面内容存成任意 `.mjs`（例如 `readusage.mjs`），**改 `F` 为你要读的会话文件**：

```js
// 读 DSH 自己记录的 token 用量与上下文压力
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 找最近修改过的会话 projcache 文件；传 UUID 可精确指定 */
export function findSessionCache(uuid){
  const DIR = 'C:\\Users\\10766\\.dsh\\storages\\session_projcache\\sessions';
  if (uuid) return join(DIR, 'session-' + uuid + '.json');
  let best = null;
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.json')) continue;
    const p = join(DIR, f), st = statSync(p);
    if (!best || st.mtimeMs > best.mtime) best = { p, mtime: st.mtimeMs };
  }
  return best && best.p;
}

export function readUsage(path){
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const R = j.record.rows;
  const get = k => (R[k] && R[k].val !== undefined) ? R[k].val : null;
  return {
    path,
    tokenUsage:      get('tokenUsage'),
    contextPressure: get('contextPressure'),
    contextBreakdown:get('contextBreakdown'),
    sessionStats:    get('sessionStats'),
    title:           get('title'),
  };
}

/* ── 直接运行时：打印成可读报告 ── */
const u = readUsage(findSessionCache(process.argv[2]));
const n = v => typeof v === 'number' ? v.toLocaleString() : JSON.stringify(v);

if (u.tokenUsage){
  const t = u.tokenUsage.totals || {};
  console.log('=== 累计用量 ===');
  console.log('  未缓存输入  : ' + n(t.uncachedInputTokens));
  console.log('  输出        : ' + n(t.outputTokens));
  console.log('  缓存命中读取: ' + n(t.cacheReadTokens));
  const totIn = (t.uncachedInputTokens||0) + (t.cacheReadTokens||0);
  if (totIn) console.log('  缓存命中率  : ' + (t.cacheReadTokens/totIn*100).toFixed(2) + '%');
}
if (u.contextPressure){
  const c = u.contextPressure;
  console.log('');
  console.log('=== 当前上下文 ===');
  console.log('  窗口        : ' + n(c.contextWindow));
  console.log('  已装载      : ' + n(c.surfaceTokens));
  if (c.contextWindow) console.log('  占用率      : ' + (c.surfaceTokens/c.contextWindow*100).toFixed(1) + '%');
  console.log('  压力值      : ' + n(c.pressureTokens));
}
if (u.contextBreakdown && u.contextBreakdown.nodes){
  const nd = u.contextBreakdown.nodes;
  let sys = 0, non = 0;
  for (const x of nd) (x.system ? sys += x.heuristicTokens||0 : non += x.heuristicTokens||0);
  console.log('');
  console.log('=== 上下文构成 ===');
  console.log('  节点数      : ' + n(nd.length));
  console.log('  系统提示    : ' + n(sys));
  console.log('  对话历史    : ' + n(non));
  console.log('  最大的 8 块 :');
  [...nd].sort((a,b)=>(b.heuristicTokens||0)-(a.heuristicTokens||0)).slice(0,8)
    .forEach(x => console.log('    seq=' + String(x.seq).padStart(6) +
      '  ' + String((x.heuristicTokens||0).toLocaleString()).padStart(10) +
      (x.system ? '  [system]' : '')));
}
if (u.sessionStats){
  const s = u.sessionStats;
  console.log('');
  console.log('=== 会话统计 ===');
  console.log('  轮次/步骤   : ' + n(s.turns) + ' / ' + n(s.steps));
  console.log('  LLM 耗时    : ' + (s.llmMs/1000/60).toFixed(1) + ' 分钟');
  console.log('  工具耗时    : ' + (s.toolMs/1000/60).toFixed(1) + ' 分钟');
  console.log('  首token等待 : ' + (s.ttftMs/1000/60).toFixed(1) + ' 分钟');
  console.log('  解码 tokens : ' + n(s.decodeTokens));
}
```

**用法**：
```powershell
node readusage.mjs                                   # 自动取最近修改的会话
node readusage.mjs d3774e32-dadd-4288-afc2-d01b4fe73e6c   # 指定 UUID
```

---

## 五、⚠️ 三个坑（我都踩过）

### 坑 1：会话文件在**两层**目录下，`readdirSync` 不递归会找不到

```js
// ❌ 找不到：sessions/ 下只有目录，文件在 <project>/<session-id>/ 里
readdirSync('C:\\Users\\10766\\.dsh\\sessions')

// ✅ 递归
const walk = d => { for (const e of readdirSync(d, {withFileTypes:true})) {
  const p = join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (e.name.endsWith('.zstd')) { /* ... */ }
}};
```

### 坑 2：`.zstd` 文件**解不出内容**（这是最大的坑）

```js
zlib.zstdDecompressSync(buf)    // → 只有 260 字节的元信息！
```

实测（2026-09-22，一条 7.0 MB 的会话）：

| 方法 | 结果 |
|---|---|
| 文件头 | `28 b5 2f fd` ← **确实是合法 zstd** |
| `zstdDecompressSync` | **260 字节**（只有头帧） |
| `createZstdDecompress()` 流式 | **270 字节** |

文件 7 MB，解出来 270 字节。**这不是多帧拼接问题，也不是我的解码方式问题** ——
apparent size 与实际内容不匹配，说明**它不是留给外部读取的**。

**结论：不要去解 `.zstd`。要用量数据就读 projcache。**

（`~\.dsh\llm-deepseek\`、`~\.dsh\storages\` 下也没有完整对话记录。）

### 坑 3：字段外面套了一层 `{ ver, seq, val }`

```js
j.record.rows.tokenUsage          // ❌ 是 { ver, seq, val }
j.record.rows.tokenUsage.val      // ✅ 真正的值
```

---

## 六、实测基线（2026-09-22，供对照）

一条 **93 轮 / 2134 步**的长会话（游戏原型开发）：

| 项 | 值 |
|---|---|
| 上下文窗口 | 1,000,000 |
| 已装载（surfaceTokens） | **277,912（27.8%）** |
| 上下文节点数 | 1,495 |
| 系统提示 tokens | 1,762（0.6%） |
| 对话历史 tokens | 276,905（99.4%） |
| 最大单节点 | 4,017 tokens |
| 累计未缓存输入 | 1,177,358 |
| 累计输出 | 1,091,312 |
| 累计缓存命中读取 | **881,664,000（缓存命中率 ≈ 99.87%）** |
| LLM 总耗时 | 147 分钟 |
| 工具总耗时 | 59 分钟 |

**可参考的判断**：
- 单节点普遍在 1–4k tokens → **没有单条消息异常臃肿**，是轮次累积
- 27.8% 占用说明 93 轮后**远未到窗口上限**
- 缓存命中率 99.87% 是长对话成本可控的主要原因

---

## 七、用户提供图片的规模（另一条线索）

```
C:\Users\10766\.dsh\attachments\v1\objects\
```

按 mtime 排序即可。实测一条会话累计 **134 张 / 57.79 MB**。

注意：**图片进上下文前会被缩放重编码**，所以字节数 ≠ token 数，只能当规模参考。

---

## 八、一句话交接

> **别问模型"你用了多少上下文"，模型不知道。**
> 去读 `~\.dsh\storages\session_projcache\sessions\session-<UUID>.json` 的
> `record.rows.contextPressure.val`（当前占用）与 `tokenUsage.val`（累计）。
> 别试图解 `.zstd`，解不出来。
