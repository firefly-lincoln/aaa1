#!/usr/bin/env node
// 自检：两半函数体的可解析性 + 关键符号断言 + 反向断言。
// 改动 lib/ 下任一文件后跑一次；退出码非 0 就别提交。
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const host = readFileSync(join(HERE, 'lib', 'host.js'), 'utf8');
const client = readFileSync(join(HERE, 'lib', 'client.js'), 'utf8');

let bad = 0;
function must(cond, what) {
  console.log((cond ? '  ✔ ' : '  ✘ ') + what);
  if (!cond) bad++;
}

console.log('== 1. 语法（包进 Function 构造器 = 真正的解析检查）==');
try { new Function('ctx', 'harness', 'console', host); must(true, 'host.js 可解析'); }
catch (e) { must(false, 'host.js 可解析 —— ' + e.message); }
try { new Function('ctx', 'React', 'host', 'styles', 'console', client); must(true, 'client.js 可解析'); }
catch (e) { must(false, 'client.js 可解析 —— ' + e.message); }

console.log('== 2. 宿主半关键符号 ==');
for (const s of [
  'contextPressure', 'tokenMeter', 'sessionProjections',
  'agent/pre-step', 'session/event', 'fs.writeText', 'workspace-write',
  'verifyOwner', 'ownerVerified', "harness.handle('bind'", "harness.handle('status'",
]) must(host.includes(s), 'host 含 ' + JSON.stringify(s));

console.log('== 3. 客户端半关键符号 ==');
for (const s of [
  'conversation.session.header.utilities', 'shell.overlay', "key: 'self'",
  "host.call('status'", "host.call('bind'", 'React.createElement',
]) must(client.includes(s), 'client 含 ' + JSON.stringify(s));

console.log('== 4. 客户端半使用的槽位必须与文档一致 ==');
const slots = ['conversation.session.header.utilities', 'shell.overlay', 'tool.view.cordis'];
for (const s of slots) must(client.includes("name: '" + s + "'"), '注册了槽位 ' + s);

console.log('== 5. 反向断言：不该出现的东西 ==');
must(!host.includes('defineTool'), '未注册动态工具（工具 schema 会进每一轮提示词，违背零 token 开销）');
must(!host.includes('cordisStamp'), '已移除失效的 cordisStamp 旧逻辑');
must(!/position:fixed;right:14px;bottom:14px[^}]*cb-inline/.test(client) && client.includes('.cb-inline'),
  '浮标就地渲染（.cb-inline 存在），不再共享右下角固定位置');
must(!client.includes("host.call('bind', { sessionId: sid })"),
  '浮标不再上报非归属绑定（只读 status，绑定只由归属锚点发起）');

console.log('');
console.log(bad === 0 ? '全部通过 ✅' : bad + ' 项失败 ❌');
process.exit(bad === 0 ? 0 : 1);
