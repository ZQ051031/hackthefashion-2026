import { sizes } from './catalog.js';

const allowance = { close: 4, regular: 8, roomy: 12 };

export function recommendSize(chart, chest, fit) {
  if (!Number.isFinite(chest) || chest < 50 || chest > 180 || !Object.hasOwn(allowance, fit)) return null;
  const ease = allowance[fit];
  const target = chest + ease;
  const index = chart.findIndex((measurement) => measurement >= target);
  if (index < 0 || target < chart[0] - 8) return { size: null, ease, target };
  return { size: sizes[index], ease, target, garmentChest: chart[index] };
}
