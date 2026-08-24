/**
 * 抽签引擎 —— 本产品的灵魂模块（PRODUCT_SPEC.md §4）
 *
 * [硬约束 #13] 纯函数：无副作用，不读时钟/存储（时间与池子均由 ctx 注入），rng 可注入。
 * [硬约束 #3]  加权随机：weight = joy × cooldown × freshness。
 *              不用 Math.random() 直接挑——均匀随机会立刻重复，用户会当成 bug（「又是它？」）。
 * [硬约束 #5]  放宽阶梯的诚实规则：只有放宽真的换来了新候选，才记入 relaxed。
 * [硬约束 #6]  安全牌模式是对用户的承诺：tier 过滤永远不放宽。哪怕池子只剩两个，
 *              也不偷偷塞进没验证过的项目。
 * [硬约束 #7]  「今天不想」永远最后放宽：用户点了就必须被尊重，宁可先放宽类别/预算。
 * [硬约束 #1]  sessionExcluded：本次会话内被重摇跳过的条目权重归零。
 *
 * 权重的刻意边界：输入全部是行为性和时间性数据（joy、冷却、新鲜度），
 * 没有一个是用户声明的「优先级」——界面上不存在任何权重调参面板。
 */
import { DrawContext, DrawRecord, DrawResult, RelaxLevel, Treasure } from './types';

export interface Rng {
  (): number;
}

export const ENGINE_CONFIG = {
  /** 候选少于该数才触发放宽阶梯 */
  minPool: 3,
  /** 最近 N 次抽取内 → 冷却 */
  cooldownDraws: 3,
  /** 冷却窗口天数（与 cooldownDraws 取先到期者） */
  cooldownDays: 7,
  /** 默认开心程度 */
  defaultJoy: 3,
  /** 从未抽过的新鲜度加成 */
  freshnessBoost: 1.5,
};

const DAY = 86400000;

/** 取某时间戳所在日的 0 点。纯函数：不读系统时钟。 */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sortedDraws(draws: DrawRecord[]): DrawRecord[] {
  return [...draws].sort((a, b) => b.drawnAt - a.drawnAt);
}

/**
 * 冷却系数：解决「又是它？」的 bug 感 [硬约束 #3]。
 * - 处于冷却窗口（最近 cooldownDraws 次内 且 距上次不足 cooldownDays 天）→ 0，等效排除
 * - 窗口外 → 从 0.3 线性爬回 1（恢复期温和回升，不搞悬崖）
 */
export function cooldownFactor(t: Treasure, draws: DrawRecord[], now: number): number {
  const hist = sortedDraws(draws);
  const rank = hist.findIndex(d => d.treasureId === t.id);
  if (rank === -1) return 1;
  const days = (now - hist[rank].drawnAt) / DAY;
  const inCooldown = rank < ENGINE_CONFIG.cooldownDraws && days < ENGINE_CONFIG.cooldownDays;
  if (inCooldown) return 0;
  return 0.3 + 0.7 * Math.min(1, days / ENGINE_CONFIG.cooldownDays);
}

/** 新鲜度：从未被抽过的条目略受偏爱——「探索」的微弱倾向 */
export function freshnessFactor(t: Treasure, draws: DrawRecord[]): number {
  return draws.some(d => d.treasureId === t.id) ? 1 : ENGINE_CONFIG.freshnessBoost;
}

/** 单条权重。sessionExcluded 命中 → 0 [硬约束 #1] */
export function weightOf(t: Treasure, ctx: DrawContext): number {
  if (ctx.sessionExcluded.includes(t.id)) return 0;
  const joy = t.joy ?? ENGINE_CONFIG.defaultJoy;
  return joy * cooldownFactor(t, ctx.draws, ctx.now) * freshnessFactor(t, ctx.draws);
}

interface FilterState {
  sceneRelaxed: boolean;
  notTodayRelaxed: boolean;
}

/** 候选过滤。注意：tier 过滤在这里，且永远不进放宽阶梯 [硬约束 #6] */
function candidates(pool: Treasure[], ctx: DrawContext, f: FilterState): Treasure[] {
  const today = startOfDay(ctx.now);
  return pool.filter(
    t =>
      t.status === 'active' &&
      (ctx.mode === 'pool' || t.tier === 'verified') &&
      (f.sceneRelaxed || ctx.sceneFilter === 'all' || t.sceneId === ctx.sceneFilter) &&
      (f.notTodayRelaxed || t.notToday == null || t.notToday !== today) &&
      !ctx.sessionExcluded.includes(t.id)
  );
}

/**
 * 抽签主函数。
 * 放宽阶梯：场景 → （V1.5：记住的偏好）→「今天不想」[硬约束 #7]
 * 诚实规则：每级放宽只有真的换来新候选才记入 relaxed [硬约束 #5]，
 * 谎报「我把刚抽过的也算上了」会直接损害用户对随机性的信任。
 */
export function draw(pool: Treasure[], ctx: DrawContext, rng: Rng): DrawResult {
  const f: FilterState = { sceneRelaxed: false, notTodayRelaxed: false };
  let cands = candidates(pool, ctx, f);
  const relaxed: RelaxLevel[] = [];

  const ladder: RelaxLevel[] = ['scene', 'notToday'];
  for (const level of ladder) {
    if (cands.length >= ENGINE_CONFIG.minPool) break;
    const before = cands.length;
    if (level === 'scene') {
      f.sceneRelaxed = true;
    } else {
      f.notTodayRelaxed = true;
    }
    const after = candidates(pool, ctx, f).length;
    if (after > before) {
      relaxed.push(level); // [硬约束 #5] 只有换来新候选才记录
    }
    cands = candidates(pool, ctx, f);
  }

  if (cands.length === 0) {
    return { treasure: null, relaxed, reason: ctx.mode === 'safe' ? 'safe-empty' : 'empty' };
  }

  const weights = cands.map(t => weightOf(t, ctx));
  const total = weights.reduce((a, b) => a + b, 0);

  let idx: number;
  if (total <= 0) {
    // 保底：候选全部处于冷却（极小池）。均匀兜底，绝不返回「无结果」。
    idx = Math.floor(rng() * cands.length);
  } else {
    let r = rng() * total;
    idx = cands.length - 1;
    for (let i = 0; i < cands.length; i++) {
      r -= weights[i];
      if (r < 0) {
        idx = i;
        break;
      }
    }
  }
  return { treasure: cands[idx], relaxed };
}
