/**
 * 合并语义 [硬约束 #9] —— 恢复备份不该反而弄丢现有的东西
 *
 * 能导出就必须能导入，且导入是合并语义（按 updatedAt 取新），不是覆盖：
 *   - 本地没有 → 新增
 *   - 本地较旧（updatedAt 更小）→ 被导入的新数据替换
 *   - 本地较新或相同 → 保留本地
 *   - 导入数据里不存在的本地条目 → 一律保留（绝不删除）
 *
 * 纯函数模块：不读存储、不读时钟，可单测（tests/merge.test.ts）。
 */
import { CustomScene, DrawRecord, Promotion, Treasure } from './types';

/** 每件小确幸最多几张照片 [硬约束 #15] —— 与 PWA 版 MAX_PHOTOS_PER_ITEM 一致 */
export const MAX_PHOTOS = 3;

export interface MergeReport {
  added: number;
  updated: number;
  kept: number;
}

export interface MergeResult<T> {
  merged: T[];
  report: MergeReport;
}

/**
 * 按 id 合并两个集合。
 * 提供 updatedAtOf 时冲突按时间戳取新；不提供时（draws/promotions 这类不可变记录）冲突保留本地。
 */
export function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  updatedAtOf?: (item: T) => number
): MergeResult<T> {
  const map = new Map(existing.map(x => [x.id, x]));
  const report: MergeReport = { added: 0, updated: 0, kept: 0 };
  for (const inc of incoming) {
    const cur = map.get(inc.id);
    if (!cur) {
      map.set(inc.id, inc);
      report.added++;
      continue;
    }
    if (updatedAtOf && updatedAtOf(inc) > updatedAtOf(cur)) {
      map.set(inc.id, inc);
      report.updated++;
    } else {
      report.kept++;
    }
  }
  return { merged: [...map.values()], report };
}

/** 导出文件的可识别结构 */
export interface ExportPayload {
  app: 'onetab';
  version: 1;
  exportedAt: number;
  treasures: Treasure[];
  draws: DrawRecord[];
  promotions: Promotion[];
  /** 自定义场景列表（可多个，id 为 `c:xxx`）。V1 旧版导出为单值 customScene，导入时兼容。 */
  customScenes?: CustomScene[] | null;
}

// ---------- 导入数据的规范化：不信任任何外部 JSON ----------

const PRESET_SCENE_IDS = ['eat', 'play', 'far', 'rest'];

/** 合法场景 id：预置四场景 或 `c:` 开头的自定义场景（允许多个） */
function isValidSceneId(id: unknown): id is string {
  return typeof id === 'string' && (PRESET_SCENE_IDS.includes(id) || id.startsWith('c:'));
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** 照片引用数组：只保留非空字符串、去重、最多 3 张 [硬约束 #15] */
function normalizePhotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string' && v && !out.includes(v)) out.push(v);
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

export function normalizeTreasure(raw: unknown, now: number): Treasure | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name.trim()) return null;
  const sceneId = isValidSceneId(r.sceneId) ? r.sceneId : 'eat';
  const note = str(r.note);
  return {
    id: r.id,
    name: r.name.slice(0, 20),
    sceneId,
    tier: r.tier === 'verified' ? 'verified' : 'wish',
    joy: typeof r.joy === 'number' ? Math.min(5, Math.max(1, Math.round(r.joy))) : 3,
    photos: normalizePhotos(r.photos), // [硬约束 #15] 导出 JSON 不含照片本体，只有引用
    audioRef: str(r.audioRef), // [硬约束 #15] 同上：语音也不带本体
    note: note ? note.slice(0, 50) : undefined,
    notToday: typeof r.notToday === 'number' ? r.notToday : null,
    status: r.status === 'archived' ? 'archived' : 'active',
    source: r.source === 'starter' ? 'starter' : 'self',
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    archivedAt: typeof r.archivedAt === 'number' ? r.archivedAt : null,
  };
}

export function normalizeDraw(raw: unknown, now: number): DrawRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.treasureId !== 'string') return null;
  const relaxed = Array.isArray(r.relaxed)
    ? (r.relaxed.filter(x => x === 'scene' || x === 'notToday') as DrawRecord['relaxed'])
    : [];
  return {
    id: r.id,
    treasureId: r.treasureId,
    mode: r.mode === 'safe' ? 'safe' : 'pool',
    sceneFilter: r.sceneFilter === 'all' || isValidSceneId(r.sceneFilter) ? r.sceneFilter : 'all',
    outcome: r.outcome === 'rerolled' ? 'rerolled' : 'accepted',
    relaxed,
    drawnAt: num(r.drawnAt, now),
    revisitAsked: num(r.revisitAsked, 0),
  };
}

export function normalizePromotion(raw: unknown, now: number): Promotion | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.treasureId !== 'string' || typeof r.drawId !== 'string') return null;
  return {
    id: r.id,
    treasureId: r.treasureId,
    drawId: r.drawId,
    confirmedAt: num(r.confirmedAt, now),
  };
}

/** 规范化一条自定义场景；脏数据丢弃 */
function normalizeCustomScene(raw: unknown): CustomScene | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.startsWith('c:')) return null;
  const label = str(r.label);
  if (!label) return null;
  const emoji = typeof r.emoji === 'string' && r.emoji ? r.emoji : '⭐';
  return { id: r.id.slice(0, 32), emoji, label: label.slice(0, 4) };
}

/** 规范化整份导入载荷；任何一段坏了只丢弃那一段，不让整份导入失败 */
export function normalizePayload(raw: unknown): Partial<ExportPayload> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const now = Date.now();
  const result: Partial<ExportPayload> = {};
  if (Array.isArray(r.treasures)) {
    result.treasures = r.treasures
      .map(x => normalizeTreasure(x, now))
      .filter((x): x is Treasure => x !== null);
  }
  if (Array.isArray(r.draws)) {
    result.draws = r.draws.map(x => normalizeDraw(x, now)).filter((x): x is DrawRecord => x !== null);
  }
  if (Array.isArray(r.promotions)) {
    result.promotions = r.promotions
      .map(x => normalizePromotion(x, now))
      .filter((x): x is Promotion => x !== null);
  }
  if (Array.isArray(r.customScenes)) {
    result.customScenes = r.customScenes
      .map(s => normalizeCustomScene(s))
      .filter((s): s is CustomScene => s !== null);
  } else if (r.customScene && typeof r.customScene === 'object') {
    // V1 旧版单值 customScene → 兼容升级为列表（老备份导入不丢场景）
    const label = str((r.customScene as Record<string, unknown>).label);
    if (label) {
      const name = label.slice(0, 4);
      result.customScenes = [{ id: `c:${name}`, emoji: '⭐', label: name }];
    }
  }
  return result;
}
