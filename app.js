const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const safeUrl = (value) => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : '#'; }
  catch { return '#'; }
};
const fmt = (value, digits = 2) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—';
const dateText = (value) => {
  if (!value || Number.isNaN(Date.parse(value))) return '时间待确认';
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

async function getJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderIssue(issue) {
  if (issue?.version !== 1 || !Array.isArray(issue.sections)) throw new Error('本期数据格式异常');
  byId('issue-number').textContent = issue.number;
  byId('issue-date').textContent = issue.date;
  byId('issue-label').textContent = issue.label;
  const comma = issue.title.indexOf('，');
  byId('issue-title').innerHTML = comma < 0 ? escapeHtml(issue.title) :
    `${escapeHtml(issue.title.slice(0, comma + 1))}<br><em>${escapeHtml(issue.title.slice(comma + 1))}</em>`;
  byId('issue-summary').textContent = issue.summary;
  byId('issue-stance').textContent = issue.stance;
  byId('issue-change').textContent = issue.change;
  byId('issue-method').textContent = issue.method;
  document.title = `第 ${issue.number} 期 · ${issue.title} | LZ-AIScope`;
  byId('evidence-cards').innerHTML = issue.sections.map((section) => `
    <article class="evidence-card" id="${escapeHtml(section.id)}">
      <div class="card-top"><span class="card-number">${escapeHtml(section.eyebrow)}</span><h3>${escapeHtml(section.title)}</h3><p class="card-reading">${escapeHtml(section.reading)}</p></div>
      <div class="card-metric"><strong>${escapeHtml(section.metric.value)}</strong><span>${escapeHtml(section.metric.label)}</span><small>${escapeHtml(section.metric.period)}</small></div>
      <div class="card-bottom"><span>下一期验证</span><p>${escapeHtml(section.next)}</p><a class="source-link" href="${safeUrl(section.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(section.source.label)} ↗</a></div>
    </article>`).join('');
  byId('issue-archive').innerHTML = (issue.archive || []).slice().reverse().map((entry) => `
    <article class="archive-item"><div class="archive-date"><strong>${escapeHtml(entry.number)}</strong><time datetime="${escapeHtml(entry.date)}">${escapeHtml(entry.date)}</time></div><div><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.note)}</p><a class="source-link" href="${safeIssuePath(entry.path)}" target="_blank" rel="noopener noreferrer">查看完整记录 ↗</a></div></article>`).join('') || '<p class="loading-note">暂无往期记录。</p>';
}

function safeIssuePath(value) {
  return /^\.\/data\/issues\/\d{4}-\d{2}-\d{2}\.json$/.test(value) ? value : '#';
}

function setStatus(id, state) {
  const element = byId(id);
  element.className = 'status-tag';
  if (state === 'ok') element.textContent = '已取得';
  else if (state === 'partial') { element.textContent = '部分取得'; element.classList.add('warn'); }
  else if (state === 'stale') { element.textContent = '上次结果'; element.classList.add('warn'); }
  else if (state === 'pending') { element.textContent = '待采样'; element.classList.add('warn'); }
  else { element.textContent = '暂不可用'; element.classList.add('bad'); }
}

function renderAuto(auto) {
  if (auto?.version !== 1) throw new Error('自动数据格式异常');
  byId('data-updated').textContent = auto.generatedAt ? `检查于 ${dateText(auto.generatedAt)}` : '尚未采样';
  const market = auto.market || {};
  const sec = auto.sec || {};
  const gpu = auto.gpu || {};
  setStatus('market-status', market.status);
  setStatus('sec-status', sec.status);
  setStatus('gpu-status', gpu.status);
  const quoteItems = (market.items || []).filter((item) => typeof item.price === 'number');
  byId('market-data').innerHTML = quoteItems.length ? quoteItems.map((item) => `
    <a class="quote-card" href="${safeUrl(item.source)}" target="_blank" rel="noopener noreferrer">
      <span class="quote-name"><strong>${escapeHtml(item.symbol)}</strong><small>${escapeHtml(item.name)}</small></span>
      <span class="quote-price">$${fmt(item.price)} <small class="${item.change < 0 ? 'negative' : 'positive'}">${item.change > 0 ? '+' : ''}${fmt(item.change)}%</small></span>
      <span class="quote-date">${escapeHtml(item.tradeDate)} 交易日 · ${item.isRealTime ? '来源标记实时' : '非实时'} ↗</span>
    </a>`).join('') : `<p class="data-empty">${escapeHtml(market.error || '等待第一次行情采样。')}</p>`;
  byId('market-context').textContent = market.error || '来源：Nasdaq 公开报价；仅显示来源返回的最近交易价和日期。';
  const secItems = (sec.items || []).filter((item) => typeof item.ratio === 'number');
  byId('sec-data').innerHTML = secItems.length ? secItems.map((item) => `
    <div class="financial-row">
      <div class="financial-head"><strong>${escapeHtml(item.symbol)} <small>${escapeHtml(item.name)}</small></strong><b>${fmt(item.ratio)}× <small>Capex / OCF</small></b></div>
      <div class="financial-metrics"><span>总收入 <strong>${fmt(typeof item.revenue === 'number' ? item.revenue / 1e9 : null, 1)}</strong></span><span>现金 Capex <strong>${fmt(item.capex / 1e9, 1)}</strong></span><span>OCF <strong>${fmt(item.ocf / 1e9, 1)}</strong></span></div>
      <small class="financial-period">${escapeHtml(item.start)} 至 ${escapeHtml(item.end)} · ${escapeHtml(item.form)} · <a class="source-link" href="${safeUrl(item.source)}" target="_blank" rel="noopener noreferrer">披露 ${escapeHtml(item.filed)} ↗</a></small>
    </div>`).join('') +
    `<small class="data-context">${escapeHtml(sec.error || '各公司报告期间可能不同；这里不作合计。')}</small>` :
    `<p class="data-empty">${escapeHtml(sec.error || '等待第一次财报采样。')}</p>`;
  const gpuItems = (gpu.summaries || []).filter((item) => item.model === 'B200' || item.model === 'H100');
  byId('gpu-data').innerHTML = gpuItems.length ? gpuItems.map((item) => `
    <div class="gpu-group"><div class="gpu-summary"><div><strong>${escapeHtml(item.model)}</strong><small>${fmt(item.count, 0)} 条 · ${fmt(item.providers, 0)} 家供应商</small></div><span><b>$${fmt(item.median)}</b><small>中位数 / GPU 时</small></span></div>
      <div class="gpu-range">挂牌范围：$${fmt(item.min)}–$${fmt(item.max)} / GPU 时</div>
      ${(gpu.offers || []).filter((offer) => offer.model === item.model).slice(0, 3).map((offer) => `<div class="offer-row"><span>${escapeHtml(offer.provider)} · ${escapeHtml(offer.region)} · ${fmt(offer.gpuCount, 0)} GPU</span><strong>$${fmt(offer.price)}</strong></div>`).join('')}
    </div>`).join('') +
    `<small class="data-context">上方明细为各型号价格最低的 3 条挂牌。来源生成于 ${dateText(gpu.sourceAt)}${gpu.error ? ` · ${escapeHtml(gpu.error)}` : ''}</small>` :
    `<p class="data-empty">${escapeHtml(gpu.error || '等待第一次 GPU 报价采样。')}</p>`;
}

function renderHistory(history) {
  const daily = Array.isArray(history?.daily) ? history.daily.slice(-5).reverse() : [];
  byId('daily-history').innerHTML = daily.length ? daily.map((entry) => {
    const b200 = entry.gpu?.find((item) => item.model === 'B200');
    const h100 = entry.gpu?.find((item) => item.model === 'H100');
    const detail = entry.gpu ? `B200 ${fmt(b200?.median)} · H100 ${fmt(h100?.median)} 美元/时` : 'GPU 来源本次未取得';
    return `<div class="history-row"><time datetime="${escapeHtml(entry.date)}">${escapeHtml(entry.date)}</time><span>${escapeHtml(detail)}</span></div>`;
  }).join('') : '<p class="loading-note">上线后开始积累每日记录。</p>';
}

async function start() {
  byId('footer-year').textContent = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric' });
  const results = await Promise.allSettled([
    getJson('./data/issue.json'), getJson('./data/auto.json'), getJson('./data/history.json'),
  ]);
  const [issue, auto, history] = results;
  try { if (issue.status === 'fulfilled') renderIssue(issue.value); else throw issue.reason; }
  catch { byId('evidence-cards').innerHTML = '<p class="loading-note">本期记录暂时无法读取，请稍后刷新。</p>'; }
  try { if (auto.status === 'fulfilled') renderAuto(auto.value); else throw auto.reason; }
  catch { byId('data-updated').textContent = '自动数据暂不可用'; setStatus('market-status', 'unavailable'); setStatus('sec-status', 'unavailable'); setStatus('gpu-status', 'unavailable'); }
  try { if (history.status === 'fulfilled') renderHistory(history.value); else throw history.reason; }
  catch { byId('daily-history').innerHTML = '<p class="loading-note">历史采样暂时无法读取。</p>'; }
}

start();
