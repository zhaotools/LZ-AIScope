import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = async (name) => JSON.parse(await readFile(path.join(root, 'data', name), 'utf8'));
const issue = await read('issue.json');
const auto = await read('auto.json');
const history = await read('history.json');
const fail = (message) => { throw new Error(message); };

if (issue.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(issue.date) || !issue.title || !issue.summary) fail('本期基本字段不完整');
if (!Array.isArray(issue.sections) || issue.sections.length !== 3) fail('三维证据应恰好有三项');
if (new Set(issue.sections.map((item) => item.id)).size !== 3) fail('证据 ID 重复');
for (const section of issue.sections) {
  if (!section.title || !section.reading || !section.next || !section.metric?.period ||
      !section.source?.url?.startsWith('https://')) fail(`证据缺少来源或口径：${section.id}`);
}
if (!Array.isArray(issue.archive) || !issue.archive.some((entry) => entry.number === issue.number && entry.date === issue.date)) fail('本期缺少历史索引');
for (const entry of issue.archive) {
  if (!/^\.\/data\/issues\/\d{4}-\d{2}-\d{2}\.json$/.test(entry.path)) fail(`历史路径异常：${entry.date}`);
  const archived = JSON.parse(await readFile(path.join(root, entry.path), 'utf8'));
  if (archived.date !== entry.date || archived.number !== entry.number || archived.title !== entry.title) fail(`历史快照与目录不符：${entry.date}`);
}
if (auto.version !== 1 || !auto.sec || !auto.gpu || !Array.isArray(auto.sec.items) || !Array.isArray(auto.gpu.summaries)) fail('自动数据格式异常');
if (history.version !== 1 || !Array.isArray(history.daily) || history.daily.length > 120) fail('每日历史格式异常');
if (new Set(history.daily.map((item) => item.date)).size !== history.daily.length) fail('每日历史日期重复');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
if (!html.includes('LZ-AIScope') || html.includes('.openai/hosting.json')) fail('页面身份或来源配置异常');
console.log('站点与数据结构检查通过');
