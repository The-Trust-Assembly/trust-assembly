import Store from 'electron-store';
import log from 'electron-log';

export interface BudgetConfig {
  maxSpendPerRun: number;
  maxSpendPerDay: number;
  maxSpendPerMonth: number;
  warningThreshold: number;
  model: 'sonnet' | 'opus';
}

interface UsageRecord {
  timestamp: string;
  runId: string;
  accountId?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  model: string;
}

const PRICING = {
  sonnet: { input: 3, output: 15 },
  opus: { input: 15, output: 75 },
};

const DEFAULT_CONFIG: BudgetConfig = {
  maxSpendPerRun: 5,
  maxSpendPerDay: 20,
  maxSpendPerMonth: 100,
  warningThreshold: 0.8,
  model: 'sonnet',
};

const store: any = new Store({
  name: 'trust-assembly-budget',
  defaults: {
    config: DEFAULT_CONFIG,
    usage: [],
  },
});

// In-memory per-run token tracking (not persisted — runs that crash just lose partial counter)
const activeRunTokens = new Map<string, { input: number; output: number }>();

export function getBudgetConfig(): BudgetConfig {
  return store.get('config') || DEFAULT_CONFIG;
}

export function setBudgetConfig(config: Partial<BudgetConfig>): BudgetConfig {
  const current = getBudgetConfig();
  const updated = { ...current, ...config };
  store.set('config', updated);
  return updated;
}

export function getModelName(): string {
  const config = getBudgetConfig();
  if (config.model === 'opus') return 'claude-opus-4-20250514';
  return 'claude-sonnet-4-20250514';
}

export function estimateCost(inputTokens: number, outputTokens: number): number {
  const config = getBudgetConfig();
  const pricing = PRICING[config.model];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// --- Per-run token tracking ---

export function resetCurrentRun(runId: string): void {
  activeRunTokens.set(runId, { input: 0, output: 0 });
}

export function addTokens(runId: string, inputTokens: number, outputTokens: number): void {
  const current = activeRunTokens.get(runId) || { input: 0, output: 0 };
  activeRunTokens.set(runId, {
    input: current.input + inputTokens,
    output: current.output + outputTokens,
  });
}

export function getCurrentRunCost(runId?: string): number {
  if (!runId) return 0;
  const tokens = activeRunTokens.get(runId) || { input: 0, output: 0 };
  return estimateCost(tokens.input, tokens.output);
}

export function getCurrentRunTokens(runId?: string): { input: number; output: number } {
  if (!runId) return { input: 0, output: 0 };
  return activeRunTokens.get(runId) || { input: 0, output: 0 };
}

export function cleanupRun(runId: string): void {
  activeRunTokens.delete(runId);
}

// --- Record completed run ---

export function recordRunUsage(runId: string, inputTokens: number, outputTokens: number, accountId?: string): void {
  const config = getBudgetConfig();
  const cost = estimateCost(inputTokens, outputTokens);
  const record: UsageRecord = {
    timestamp: new Date().toISOString(),
    runId,
    accountId,
    inputTokens,
    outputTokens,
    estimatedCost: cost,
    model: config.model,
  };

  const usage: UsageRecord[] = store.get('usage') || [];
  usage.push(record);
  if (usage.length > 1000) usage.splice(0, usage.length - 1000);
  store.set('usage', usage);

  log.info(`Run ${runId} cost: $${cost.toFixed(4)} (${inputTokens} in / ${outputTokens} out)`);
}

// --- Budget checks ---

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  currentRunCost: number;
  todayCost: number;
  monthCost: number;
  limits: BudgetConfig;
  warnings: string[];
}

export function checkBudget(runId?: string): BudgetCheck {
  const config = getBudgetConfig();
  const usage: UsageRecord[] = store.get('usage') || [];
  const warnings: string[] = [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const todayCost = usage
    .filter(u => u.timestamp >= todayStart)
    .reduce((sum, u) => sum + u.estimatedCost, 0);

  const monthCost = usage
    .filter(u => u.timestamp >= monthStart)
    .reduce((sum, u) => sum + u.estimatedCost, 0);

  const currentRunCost = getCurrentRunCost(runId);

  // Also account for OTHER active runs' costs in daily/monthly checks
  let otherActiveRunsCost = 0;
  for (const [id, tokens] of activeRunTokens) {
    if (id !== runId) {
      otherActiveRunsCost += estimateCost(tokens.input, tokens.output);
    }
  }

  if (currentRunCost >= config.maxSpendPerRun) {
    return {
      allowed: false,
      reason: `Run budget exceeded: $${currentRunCost.toFixed(2)} / $${config.maxSpendPerRun.toFixed(2)} per run`,
      currentRunCost, todayCost, monthCost, limits: config, warnings,
    };
  }

  const totalTodayCost = todayCost + currentRunCost + otherActiveRunsCost;
  if (totalTodayCost >= config.maxSpendPerDay) {
    return {
      allowed: false,
      reason: `Daily budget exceeded: $${totalTodayCost.toFixed(2)} / $${config.maxSpendPerDay.toFixed(2)} per day`,
      currentRunCost, todayCost, monthCost, limits: config, warnings,
    };
  }

  const totalMonthCost = monthCost + currentRunCost + otherActiveRunsCost;
  if (totalMonthCost >= config.maxSpendPerMonth) {
    return {
      allowed: false,
      reason: `Monthly budget exceeded: $${totalMonthCost.toFixed(2)} / $${config.maxSpendPerMonth.toFixed(2)} per month`,
      currentRunCost, todayCost, monthCost, limits: config, warnings,
    };
  }

  const runPct = currentRunCost / config.maxSpendPerRun;
  const dayPct = totalTodayCost / config.maxSpendPerDay;
  const monthPct = totalMonthCost / config.maxSpendPerMonth;

  if (runPct >= config.warningThreshold) {
    warnings.push(`Run approaching limit: $${currentRunCost.toFixed(2)} / $${config.maxSpendPerRun.toFixed(2)} (${(runPct * 100).toFixed(0)}%)`);
  }
  if (dayPct >= config.warningThreshold) {
    warnings.push(`Daily spend approaching limit: $${totalTodayCost.toFixed(2)} / $${config.maxSpendPerDay.toFixed(2)} (${(dayPct * 100).toFixed(0)}%)`);
  }
  if (monthPct >= config.warningThreshold) {
    warnings.push(`Monthly spend approaching limit: $${totalMonthCost.toFixed(2)} / $${config.maxSpendPerMonth.toFixed(2)} (${(monthPct * 100).toFixed(0)}%)`);
  }

  return {
    allowed: true,
    currentRunCost, todayCost, monthCost, limits: config, warnings,
  };
}

export function getUsageSummary(): {
  today: number;
  thisMonth: number;
  allTime: number;
  totalRuns: number;
  limits: BudgetConfig;
} {
  const config = getBudgetConfig();
  const usage: UsageRecord[] = store.get('usage') || [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  return {
    today: usage.filter(u => u.timestamp >= todayStart).reduce((s, u) => s + u.estimatedCost, 0),
    thisMonth: usage.filter(u => u.timestamp >= monthStart).reduce((s, u) => s + u.estimatedCost, 0),
    allTime: usage.reduce((s, u) => s + u.estimatedCost, 0),
    totalRuns: new Set(usage.map(u => u.runId)).size,
    limits: config,
  };
}
