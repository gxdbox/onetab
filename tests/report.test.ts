/**
 * 回忆时间线与年报的纯函数测试
 */
import { describe, it, expect } from 'vitest';
import { anniversaries, annualReport } from '../miniprogram/core/report';
import { DrawRecord, Promotion, Treasure } from '../miniprogram/core/types';

function treasure(id: string, createdAt: number, sceneId: Treasure['sceneId'] = 'eat'): Treasure {
  return {
    id,
    name: `面${id}`,
    sceneId,
    tier: 'wish',
    joy: 3,
    photoRef: null,
    notToday: null,
    status: 'active',
    source: 'self',
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
  };
}

function draw(id: string, treasureId: string, drawnAt: number, outcome: DrawRecord['outcome'] = 'accepted'): DrawRecord {
  return { id, treasureId, mode: 'pool', sceneFilter: 'all', outcome, relaxed: [], drawnAt, revisitAsked: 0 };
}

function promotion(id: string, treasureId: string, drawId: string, confirmedAt: number): Promotion {
  return { id, treasureId, drawId, confirmedAt };
}

// 2026-08-22 12:00
const NOW = new Date(2026, 7, 22, 12).getTime();

describe('anniversaries（一年前的今天）', () => {
  it('一年前同月同日的烫金时刻被找到，文案含「烫成了金」', () => {
    const at = new Date(2025, 7, 22, 9).getTime();
    const t = treasure('a', at);
    const out = anniversaries([], [t], [promotion('p1', 'a', 'd1', at)], NOW);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('promotion');
    expect(out[0].yearsAgo).toBe(1);
    expect(out[0].text).toContain('烫成了金');
  });

  it('一年前被指中（未烫金）也被找到', () => {
    const at = new Date(2025, 7, 22, 9).getTime();
    const t = treasure('a', at);
    const out = anniversaries([draw('d1', 'a', at)], [t], [], NOW);
    expect(out.length).toBe(1);
    expect(out[0].text).toContain('闭眼一指');
  });

  it('今年发生的不算（yearsAgo >= 1 才算回忆）', () => {
    const at = new Date(2026, 7, 22, 9).getTime();
    const t = treasure('a', at);
    expect(anniversaries([draw('d1', 'a', at)], [t], [], NOW).length).toBe(0);
  });

  it('同月不同日 / 同日不同月都不算', () => {
    const t = treasure('a', NOW);
    expect(anniversaries([draw('d1', 'a', new Date(2025, 7, 21).getTime())], [t], [], NOW).length).toBe(0);
    expect(anniversaries([draw('d2', 'a', new Date(2025, 6, 22).getTime())], [t], [], NOW).length).toBe(0);
  });

  it('被重摇跳过的抽取不是回忆', () => {
    const at = new Date(2025, 7, 22).getTime();
    const t = treasure('a', at);
    expect(anniversaries([draw('d1', 'a', at, 'rerolled')], [t], [], NOW).length).toBe(0);
  });

  it('烫金权重高于被指中；同条目同年同日只报烫金', () => {
    const at = new Date(2025, 7, 22).getTime();
    const t = treasure('a', at);
    const out = anniversaries([draw('d1', 'a', at)], [t], [promotion('p1', 'a', 'd1', at)], NOW);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('promotion');
  });

  it('条目已被彻底删除 → 找不到名字，不报（回忆卡片不显示破引号）', () => {
    const at = new Date(2025, 7, 22).getTime();
    expect(anniversaries([draw('d1', 'ghost', at)], [], [], NOW).length).toBe(0);
  });
});

describe('annualReport（年度快乐报告）', () => {
  const y = 2026;
  const inYear = new Date(2026, 3, 1).getTime();
  const lastYear = new Date(2025, 3, 1).getTime();

  it('统计收集/烫金/抽签数，且只统计当年', () => {
    const ts = [treasure('a', inYear), treasure('b', inYear), treasure('old', lastYear)];
    const ds = [draw('d1', 'a', inYear), draw('d2', 'b', inYear), draw('d3', 'old', lastYear)];
    const ps = [promotion('p1', 'a', 'd1', inYear)];
    const r = annualReport(ts, ds, ps, y);
    expect(r.collected).toBe(2);
    expect(r.drawn).toBe(2);
    expect(r.verified).toBe(1);
    expect(r.hasData).toBe(true);
  });

  it('最常被指到的条目', () => {
    const ts = [treasure('a', inYear), treasure('b', inYear)];
    const ds = [draw('d1', 'a', inYear), draw('d2', 'a', inYear), draw('d3', 'b', inYear)];
    const r = annualReport(ts, ds, [], y);
    expect(r.topDraw!.name).toBe('面a');
    expect(r.topDraw!.count).toBe(2);
  });

  it('firstOf = 今年最早收集的一条', () => {
    const early = new Date(2026, 0, 5).getTime();
    const ts = [treasure('late', inYear), treasure('early', early)];
    const r = annualReport(ts, [], [], y);
    expect(r.firstOf!.name).toBe('面early');
  });

  it('已删除条目的抽签计入「已删的条目」，场景条按次数倒序', () => {
    const ts = [treasure('a', inYear, 'eat'), treasure('b', inYear, 'far')];
    const ds = [
      draw('d1', 'a', inYear),
      draw('d2', 'a', inYear),
      draw('d3', 'ghost', inYear),
    ];
    const r = annualReport(ts, ds, [], y);
    expect(r.sceneBars[0].sceneId).toBe('eat');
    expect(r.sceneBars.some(b => b.sceneId === 'other' && b.count === 1)).toBe(true);
  });

  it('空年份 → hasData false（页面显示安静空态，不硬凑数据）', () => {
    const r = annualReport([treasure('a', lastYear)], [], [], y);
    expect(r.hasData).toBe(false);
    expect(r.collected).toBe(0);
  });
});
