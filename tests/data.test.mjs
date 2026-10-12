import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCashCoverage, parseGpu } from '../scripts/update-data.mjs';

test('财报只配对同一报告和同一期间的现金流项目', () => {
  const period = { start: '2026-01-01', end: '2026-06-30', filed: '2026-07-30', form: '10-Q', accn: '0001-26-000001' };
  const data = { facts: { 'us-gaap': {
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [{ ...period, val: 100 }] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [
      { ...period, accn: '0001-26-000002', val: 90 },
      { ...period, val: 60 },
      { ...period, start: '2026-04-01', val: 99 },
    ] } },
  } } };
  const result = parseCashCoverage(data, { symbol: 'TEST', name: 'Test', cik: '0000000001' }, '2026-08-01');
  assert.equal(result.ratio, 0.6);
  assert.equal(result.start, period.start);
  assert.equal(result.end, period.end);
});

test('GPU 统计排除 spot 与不可用条目，并按价格基准换算', () => {
  const data = { success: true, timestamp: '2026-10-12T00:00:00Z', data: [
    { gpuShortName: 'B200', price: 64, gpuCount: 8, available: 1, provider: 'cloud-a', priceBasis: 'node', type: 'instant' },
    { gpuShortName: 'B200', price: 10, gpuCount: 1, available: 1, provider: 'cloud-b', priceBasis: 'gpu', type: 'instant' },
    { gpuShortName: 'B200', price: 1, gpuCount: 1, available: 1, provider: 'cloud-c', type: 'spot' },
    { gpuShortName: 'H100', price: 3, gpuCount: 1, available: 0, provider: 'cloud-d', type: 'instant' },
  ] };
  const result = parseGpu(data);
  assert.deepEqual(result.summaries[0], { model: 'B200', median: 9, count: 2, providers: 2 });
  assert.deepEqual(result.summaries[1], { model: 'H100', median: null, count: 0, providers: 0 });
});
