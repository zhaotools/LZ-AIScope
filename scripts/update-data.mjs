import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const autoPath = path.join(root, 'data/auto.json');
const historyPath = path.join(root, 'data/history.json');
const companies = [
  { symbol: 'MSFT', name: 'Microsoft', cik: '0000789019' },
  { symbol: 'META', name: 'Meta', cik: '0001326801' },
];

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function parseGpu(data) {
  if (!data?.success || !Array.isArray(data.data) || !Number.isFinite(Date.parse(data.timestamp))) {
    throw new Error('GPU 来源格式异常');
  }
  const offers = data.data.flatMap((offer) => {
    if (!finite(offer.price) || offer.price <= 0 || !finite(offer.gpuCount) || offer.gpuCount <= 0 ||
        !finite(offer.available) || offer.available <= 0 || offer.type === 'spot') return [];
    const model = String(offer.gpuShortName || '').toUpperCase();
    const group = ['B200', 'H100'].find((name) => new RegExp(`^${name}(?:$|[^A-Z0-9])`).test(model));
    if (!group) return [];
    const basis = offer.priceBasis ?? (offer.provider === 'akash' ? 'gpu' : 'node');
    if (!['gpu', 'node'].includes(basis)) return [];
    return [{ model: group, price: offer.price / (basis === 'gpu' ? 1 : offer.gpuCount), provider: String(offer.provider || '未披露') }];
  });
  return {
    sourceAt: data.timestamp,
    summaries: ['B200', 'H100'].map((model) => {
      const group = offers.filter((offer) => offer.model === model);
      return {
        model,
        median: median(group.map((offer) => offer.price)),
        count: group.length,
        providers: new Set(group.map((offer) => offer.provider)).size,
      };
    }),
  };
}

export function parseCashCoverage(data, company, today = new Date().toISOString().slice(0, 10)) {
  const facts = data?.facts?.['us-gaap'];
  if (!facts) throw new Error('缺少 US GAAP 财务标签');
  const entries = (tag) => (facts[tag]?.units?.USD ?? []).filter((fact) => {
    const days = (Date.parse(fact.end) - Date.parse(fact.start)) / 86400000 + 1;
    return ['10-K', '10-Q', '10-K/A', '10-Q/A'].includes(fact.form) &&
      fact.filed <= today && fact.end <= today && fact.start && fact.accn &&
      finite(fact.val) && days >= 60 && days <= 380;
  });
  const ocfs = entries('NetCashProvidedByUsedInOperatingActivities');
  const capex = ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']
    .flatMap((tag) => entries(tag).map((fact) => ({ ...fact, tag })));
  const pairs = ocfs.flatMap((ocf) => {
    const match = capex.find((item) => item.start === ocf.start && item.end === ocf.end && item.accn === ocf.accn);
    return match ? [{ ocf, capex: match }] : [];
  });
  pairs.sort((a, b) => b.ocf.end.localeCompare(a.ocf.end) ||
    (Date.parse(a.ocf.start) - Date.parse(b.ocf.start)) || b.ocf.filed.localeCompare(a.ocf.filed));
  const pair = pairs.find(({ ocf, capex: spend }) => ocf.val > 0 && spend.val >= 0);
  if (!pair) throw new Error('没有可配对的现金资本开支与经营现金流');
  const { ocf, capex: spend } = pair;
  return {
    symbol: company.symbol,
    name: company.name,
    ratio: spend.val / ocf.val,
    capex: spend.val,
    ocf: ocf.val,
    start: ocf.start,
    end: ocf.end,
    filed: ocf.filed,
    form: ocf.form,
    capexTag: spend.tag,
    source: `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${ocf.accn.replaceAll('-', '')}/`,
  };
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`来源返回 HTTP ${response.status}`);
  return response.json();
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function chinaDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

async function main() {
  const previous = await readJson(autoPath, { version: 1, sec: { items: [] }, gpu: { summaries: [] } });
  const history = await readJson(historyPath, { version: 1, daily: [] });
  const now = new Date();
  const generatedAt = now.toISOString();
  const next = { ...previous, version: 1, generatedAt };

  try {
    const payload = await getJson('https://server.aquanode.io/api/v1/marketplace');
    next.gpu = { status: 'ok', fetchedAt: generatedAt, ...parseGpu(payload), error: null };
  } catch (error) {
    next.gpu = { ...previous.gpu, status: previous.gpu?.fetchedAt ? 'stale' : 'unavailable', error: error.message };
    console.warn(`GPU：${error.message}`);
  }

  const secAgent = process.env.SEC_USER_AGENT || 'LZ-AIScope/1.0 (https://github.com/zhaotools/LZ-AIScope/issues)';
  const results = await Promise.all(companies.map(async (company) => {
    try {
      const payload = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${company.cik}.json`, { 'User-Agent': secAgent });
      return parseCashCoverage(payload, company);
    } catch (error) {
      console.warn(`${company.symbol} 财报：${error.message}`);
      return { symbol: company.symbol, error: error.message };
    }
  }));
  const oldItems = new Map((previous.sec?.items || []).map((item) => [item.symbol, item]));
  const items = results.map((item) => item.error ? oldItems.get(item.symbol) || item : item);
  const okCount = results.filter((item) => !item.error).length;
  next.sec = {
    status: okCount === companies.length ? 'ok' : items.some((item) => finite(item.ratio)) ? 'partial' : 'unavailable',
    fetchedAt: okCount ? generatedAt : previous.sec?.fetchedAt || null,
    items,
    error: okCount === companies.length ? null : `${companies.length - okCount} 家公司本次读取失败；已有数值保留原披露期间`,
  };

  const day = chinaDate(now);
  const daily = (history.daily || []).filter((entry) => entry.date !== day);
  daily.push({
    date: day,
    capturedAt: generatedAt,
    gpu: next.gpu?.status === 'ok' ? next.gpu.summaries.map(({ model, median: value, count, providers }) => ({ model, median: value, count, providers })) : null,
    sec: results.filter((item) => !item.error).map(({ symbol, ratio, start, end }) => ({ symbol, ratio, start, end })),
  });
  daily.sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(autoPath, JSON.stringify(next, null, 2) + '\n');
  await writeFile(historyPath, JSON.stringify({ version: 1, daily: daily.slice(-120) }, null, 2) + '\n');
  console.log(`已更新 ${day}：GPU ${next.gpu.status}，SEC ${next.sec.status}；保留 ${Math.min(daily.length, 120)} 日记录`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
