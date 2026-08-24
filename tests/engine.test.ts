/**
 * 抽签引擎单元测试 [硬约束 #13]
 * 这是产品的灵魂，不能靠手点验证。
 * 覆盖：加权计算、冷却归零、放宽阶梯的诚实规则（每一级）、
 *       安全牌模式零污染、重摇后已跳过条目权重归零、种子 rng 确定性。
 */
import { describe, it, expect } from 'vitest';
import { cooldownFactor, draw, weightOf } from '../miniprogram/core/engine';
import { DrawContext, DrawRecord, Treasure } from '../miniprogram/core/types';

const DAY = 86400000;
const NOW = 1700000000000;

let seq = 0;
function t(p: Partial<Treasure> = {}): Treasure {
  const base: Treasure = {
    id: 't' + ++seq,
    name: '条目' + seq,
    sceneId: 'eat',
    tier: 'wish',
    joy: 3,
    photoRef: null,
    notToday: null,
    status: 'active',
    source: 'self',
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
  };
  return Object.assign(base, p);
}
function d(treasureId: string, drawnAt: number): DrawRecord {
  return {
    id: 'd' + ++seq,
    treasureId,
    mode: 'pool',
    sceneFilter: 'all',
    outcome: 'accepted',
    relaxed: [],
    drawnAt,
    revisitAsked: 0,
  };
}
/** 线性同余发生器：种子固定 → 序列可复现 */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function ctx(p: Partial<DrawContext> = {}): DrawContext {
  return { now: NOW, mode: 'pool', sceneFilter: 'all', sessionExcluded: [], draws: [], ...p };
}

describe('冷却期 [硬约束 #3]', () => {
  it('最近 3 次抽取内且不足 7 天 → 权重为 0（等效排除「又是它？」）', () => {
    const a = t();
    expect(cooldownFactor(a, [d(a.id, NOW - DAY)], NOW)).toBe(0);
    expect(cooldownFactor(a, [d('x', NOW), d('y', NOW - 1), d(a.id, NOW - 2 * DAY)], NOW)).toBe(0);
  });

  it('超过 7 天 → 恢复为 1', () => {
    const a = t();
    expect(cooldownFactor(a, [d(a.id, NOW - 8 * DAY)], NOW)).toBe(1);
  });

  it('已被 3 次更新抽取顶出窗口 → 不再冷却，但温和回升', () => {
    const a = t();
    const factor = cooldownFactor(
      a,
      [d('x', NOW), d('y', NOW - 1), d('z', NOW - 2), d(a.id, NOW - DAY)],
      NOW
    );
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
  });

  it('从未抽过 → 冷却系数为 1', () => {
    expect(cooldownFactor(t(), [], NOW)).toBe(1);
  });

  it('冷却中的条目在有多候选时永不被抽中', () => {
    const a = t({ name: '刚抽过' });
    const b = t();
    const c = t();
    const draws = [d(a.id, NOW - DAY)];
    const rng = lcg(7);
    for (let i = 0; i < 500; i++) {
      const r = draw([a, b, c], ctx({ draws }), rng);
      expect(r.treasure!.id).not.toBe(a.id);
    }
  });
});

describe('加权 [硬约束 #3]', () => {
  it('joy 越高越常被抽中', () => {
    const a = t({ joy: 5 });
    const b = t({ joy: 1 });
    const rng = lcg(42);
    let ca = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (draw([a, b], ctx(), rng).treasure!.id === a.id) ca++;
    }
    // 理论占比 7.5/9 ≈ 83%，宽松断言 > 2 倍即可
    expect(ca).toBeGreaterThan((n - ca) * 2);
  });

  it('从未抽过的条目有新鲜度加成', () => {
    const a = t(); // 从未抽过 → 3 × 1.5 = 4.5
    const b = t(); // 30 天前抽过 → 3 × 1 = 3
    const draws = [d(b.id, NOW - 30 * DAY)];
    const rng = lcg(99);
    let ca = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (draw([a, b], ctx({ draws }), rng).treasure!.id === a.id) ca++;
    }
    expect(ca).toBeGreaterThan(n - ca);
  });

  it('sessionExcluded 命中 → 权重为 0，永不被抽中 [硬约束 #1]', () => {
    const a = t();
    const b = t();
    const c = t();
    const rng = lcg(3);
    expect(weightOf(a, ctx({ sessionExcluded: [a.id] }))).toBe(0);
    for (let i = 0; i < 300; i++) {
      const r = draw([a, b, c], ctx({ sessionExcluded: [a.id] }), rng);
      expect(r.treasure!.id).not.toBe(a.id);
    }
  });
});

describe('放宽阶梯的诚实规则 [硬约束 #5 #7]', () => {
  it('放宽只有真的换来新候选才被记录：场景放宽无新增时不记，只记真正生效的 notToday', () => {
    const today = new Date(NOW);
    today.setHours(0, 0, 0, 0);
    const a = t({ notToday: today.getTime() });
    const b = t({ notToday: today.getTime() });
    const c = t();
    // 全部是 eat，场景筛选已是 eat：放宽场景不会带来新候选 → 不许谎报
    const r = draw([a, b, c], ctx({ sceneFilter: 'eat' }), lcg(1));
    expect(r.relaxed).toEqual(['notToday']);
    expect(r.relaxed).not.toContain('scene');
  });

  it('场景放宽真的换来新候选时被记录', () => {
    const e1 = t({ sceneId: 'eat' });
    const e2 = t({ sceneId: 'eat' });
    const p1 = t({ sceneId: 'play' });
    const p2 = t({ sceneId: 'play' });
    const p3 = t({ sceneId: 'play' });
    const r = draw([e1, e2, p1, p2, p3], ctx({ sceneFilter: 'eat' }), lcg(1));
    expect(r.relaxed).toEqual(['scene']);
  });

  it('候选充足时不放宽', () => {
    const pool = [t(), t(), t(), t()];
    const r = draw(pool, ctx({ sceneFilter: 'eat' }), lcg(1));
    expect(r.relaxed).toEqual([]);
  });

  it('「今天不想」被命中时结果仍返回（由 UI 层明确标注，用户可拒绝）', () => {
    const today = new Date(NOW);
    today.setHours(0, 0, 0, 0);
    const a = t({ notToday: today.getTime() });
    const b = t({ notToday: today.getTime() });
    const c = t({ notToday: today.getTime() });
    const r = draw([a, b, c], ctx(), lcg(1));
    expect(r.treasure).not.toBeNull();
    expect(r.relaxed).toContain('notToday');
  });

  it('notToday 次日自动失效', () => {
    const yesterday = new Date(NOW - DAY);
    yesterday.setHours(0, 0, 0, 0);
    const a = t({ notToday: yesterday.getTime() });
    const b = t();
    const c = t();
    const r = draw([a, b, c], ctx(), lcg(1));
    expect(r.relaxed).toEqual([]);
  });
});

describe('安全牌模式 [硬约束 #6]', () => {
  it('只抽 verified 条目，wish 永不混入', () => {
    const v1 = t({ tier: 'verified' });
    const v2 = t({ tier: 'verified' });
    const wishes = [t(), t(), t(), t(), t()];
    const rng = lcg(11);
    for (let i = 0; i < 500; i++) {
      const r = draw([v1, v2, ...wishes], ctx({ mode: 'safe' }), rng);
      expect(r.treasure!.tier).toBe('verified');
    }
  });

  it('哪怕候选不足（放宽阶梯走完），tier 也绝不放宽', () => {
    const v1 = t({ tier: 'verified' });
    const wishes = [t(), t(), t(), t(), t(), t()];
    const r = draw([v1, ...wishes], ctx({ mode: 'safe', sceneFilter: 'play' }), lcg(5));
    // 唯一 verified 是 eat，场景放宽会把它带回来——但 wish 依然被挡在 tier 门外
    expect(r.treasure).not.toBeNull();
    expect(r.treasure!.tier).toBe('verified');
  });

  it('池子全是 wish → 诚实空态，绝不静默污染', () => {
    const r = draw([t(), t(), t()], ctx({ mode: 'safe' }), lcg(5));
    expect(r.treasure).toBeNull();
    expect(r.reason).toBe('safe-empty');
  });
});

describe('边界与确定性 [硬约束 #13]', () => {
  it('空池 → treasure 为 null，reason 为 empty', () => {
    const r = draw([], ctx(), lcg(1));
    expect(r.treasure).toBeNull();
    expect(r.reason).toBe('empty');
  });

  it('候选全部处于冷却 → 均匀兜底，仍返回结果而非 null', () => {
    const a = t();
    const b = t();
    const draws = [d(a.id, NOW - DAY), d(b.id, NOW - 2 * DAY)];
    const r = draw([a, b], ctx({ draws }), lcg(1));
    expect(r.treasure).not.toBeNull();
  });

  it('archived 条目不进池子 [硬约束 #8 语义]', () => {
    const a = t({ status: 'archived' });
    const r = draw([a], ctx(), lcg(1));
    expect(r.treasure).toBeNull();
  });

  it('同一种子 → 同一序列（可复现）', () => {
    const pool = [t(), t(), t(), t(), t()];
    const run = () => {
      const rng = lcg(42);
      const out: string[] = [];
      for (let i = 0; i < 50; i++) out.push(draw(pool, ctx(), rng).treasure!.id);
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('纯函数：不修改入参', () => {
    const pool = [t(), t(), t(), t()];
    const draws = [d(pool[0].id, NOW - DAY)];
    const snapshot = JSON.stringify([pool, draws]);
    draw(pool, ctx({ draws }), lcg(1));
    expect(JSON.stringify([pool, draws])).toBe(snapshot);
  });
});
