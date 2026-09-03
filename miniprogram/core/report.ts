/**
 * 回忆的时间价值（V2）—— 时间线与年报的纯计算
 *
 * 规格 §5.3：「一年前的今天，牛肉面第一次烫金」。Draw + Promotion 数据此刻成熟。
 * 年报一年一次、静态呈现——**不做月报/周报**，低频才配得上「年报」的仪式感。
 *
 * 纯函数：时钟注入，可单测（tests/report.test.ts）。
 */
import { SCENES } from './scenes';
import { SceneId } from './types';
import { DrawRecord, Promotion, Treasure } from './types';

// ---------- 一年前的今天 ----------

export interface Anniversary {
  kind: 'promotion' | 'draw';
  treasureName: string;
  yearsAgo: number;
  at: number;
  text: string;
}

/**
 * 找出「与今天同月同日、但发生在往年」的烫金时刻与被指中的时刻。
 * 情感权重：promotion > draw；同年内多条时按时间倒序。
 */
export function anniversaries(
  draws: DrawRecord[],
  treasures: Treasure[],
  promotions: Promotion[],
  now: number
): Anniversary[] {
  const names = new Map(treasures.map(t => [t.id, t.name]));
  const n = new Date(now);
  const todayMD = n.getMonth() * 100 + n.getDate();
  const out: Anniversary[] = [];

  for (const p of promotions) {
    const d = new Date(p.confirmedAt);
    const yearsAgo = n.getFullYear() - d.getFullYear();
    if (yearsAgo < 1 || d.getMonth() * 100 + d.getDate() !== todayMD) continue;
    const name = names.get(p.treasureId);
    if (!name) continue;
    out.push({
      kind: 'promotion',
      treasureName: name,
      yearsAgo,
      at: p.confirmedAt,
      text: `「${name}」在${yearsAgo}年前的今天，从素描烫成了金`,
    });
  }

  for (const dr of draws) {
    if (dr.outcome !== 'accepted') continue; // 被重摇跳过的不算回忆
    const d = new Date(dr.drawnAt);
    const yearsAgo = n.getFullYear() - d.getFullYear();
    if (yearsAgo < 1 || d.getMonth() * 100 + d.getDate() !== todayMD) continue;
    const name = names.get(dr.treasureId);
    if (!name) continue;
    // 同一条目同年同日的烫金已覆盖了「被指中」，不重复报
    const promotedSameDay = promotions.some(
      p =>
        p.treasureId === dr.treasureId &&
        new Date(p.confirmedAt).getFullYear() === d.getFullYear() &&
        new Date(p.confirmedAt).getMonth() * 100 + new Date(p.confirmedAt).getDate() ===
          d.getMonth() * 100 + d.getDate()
    );
    if (promotedSameDay) continue;
    out.push({
      kind: 'draw',
      treasureName: name,
      yearsAgo,
      at: dr.drawnAt,
      text: `${yearsAgo}年前的今天，你闭眼一指，指中了「${name}」`,
    });
  }

  const weight = (a: Anniversary) => (a.kind === 'promotion' ? 1 : 0);
  return out.sort((a, b) => weight(b) - weight(a) || b.at - a.at);
}

// ---------- 年度快乐报告 ----------

export interface SceneBar {
  sceneId: SceneId | 'other';
  emoji: string;
  label: string;
  count: number;
}

export interface AnnualReport {
  year: number;
  /** 今年收集的条目数（含已归档——收集过的快乐都算） */
  collected: number;
  /** 今年烫金数 */
  verified: number;
  /** 今年抽签次数 */
  drawn: number;
  /** 最常被指到的条目 */
  topDraw?: { name: string; count: number };
  /** 今年最早收集的一条：「这一切从它开始」 */
  firstOf?: { name: string; at: number };
  /** 场景分布（按抽签次数） */
  sceneBars: SceneBar[];
  hasData: boolean;
}

export function annualReport(
  treasures: Treasure[],
  draws: DrawRecord[],
  promotions: Promotion[],
  year: number
): AnnualReport {
  const inYear = (ts: number) => new Date(ts).getFullYear() === year;

  const collectedList = treasures.filter(t => inYear(t.createdAt));
  const yearDraws = draws.filter(d => inYear(d.drawnAt));
  const yearPromotions = promotions.filter(p => inYear(p.confirmedAt));

  // 最常被指到
  const drawCount = new Map<string, number>();
  for (const d of yearDraws) drawCount.set(d.treasureId, (drawCount.get(d.treasureId) ?? 0) + 1);
  const names = new Map(treasures.map(t => [t.id, t.name]));
  let topDraw: AnnualReport['topDraw'];
  for (const [id, count] of drawCount) {
    const name = names.get(id);
    if (!name) continue;
    if (!topDraw || count > topDraw.count) topDraw = { name, count };
  }

  // 场景分布（按抽签次数；条目已被删除的计入 other）
  // 预置四场景 + 数据中出现的自定义场景（id 形如 `c:电影`，label 从 id 提取）
  const sceneOf_ = new Map(treasures.map(t => [t.id, t.sceneId]));
  const sceneCount = new Map<string, number>();
  for (const d of yearDraws) {
    const sid = sceneOf_.get(d.treasureId) ?? 'other';
    sceneCount.set(sid, (sceneCount.get(sid) ?? 0) + 1);
  }
  const sceneDefs: { id: string; emoji: string; label: string }[] = [...SCENES];
  for (const sid of sceneCount.keys()) {
    if (sid !== 'other' && !SCENES.some(s => s.id === sid)) {
      sceneDefs.push({
        id: sid,
        emoji: '⭐',
        label: sid.startsWith('c:') ? sid.slice(2) : sid,
      });
    }
  }
  const sceneBars: SceneBar[] = sceneDefs
    .filter(s => (sceneCount.get(s.id) ?? 0) > 0)
    .map(s => ({
      sceneId: s.id,
      emoji: s.emoji,
      label: s.label,
      count: sceneCount.get(s.id) ?? 0,
    }));
  if ((sceneCount.get('other') ?? 0) > 0) {
    sceneBars.push({ sceneId: 'other', emoji: '📫', label: '已删的条目', count: sceneCount.get('other') ?? 0 });
  }
  sceneBars.sort((a, b) => b.count - a.count);

  const first = collectedList.slice().sort((a, b) => a.createdAt - b.createdAt)[0];

  return {
    year,
    collected: collectedList.length,
    verified: yearPromotions.length,
    drawn: yearDraws.length,
    topDraw,
    firstOf: first ? { name: first.name, at: first.createdAt } : undefined,
    sceneBars,
    hasData: collectedList.length > 0 || yearDraws.length > 0 || yearPromotions.length > 0,
  };
}
