/**
 * Repo —— 领域操作层
 *
 * [硬约束 #14] 本文件只依赖 LocalStore（本地真相源），绝不 import ../sync ——
 *   整个删掉 sync/ 目录，本文件与所有页面照常工作。
 * [硬约束 #4]  wish → verified 的晋级只能走 promote()（回访确认开心），没有别的通道。
 * [硬约束 #8]  归档（archive）必须可撤销（restore），removeHard 才是彻底删除。
 * [硬约束 #15] setJoy 等主表字段更新只写 treasures 集合，绝不触碰照片文件。
 */
import { DrawMode, DrawOutcome, DrawRecord, Promotion, RelaxLevel, SceneId, Treasure } from '../core/types';
import { newId } from '../core/id';
import { startOfDay } from '../core/engine';
import { ExportPayload, MAX_PHOTOS, MergeReport, mergeById, normalizePayload } from '../core/merge';
import { LocalStore, WxStorageStore } from './store';
import { getCustomScenes, mergeCustomScenes } from './prefs';

export interface NewTreasureInput {
  name: string;
  sceneId: SceneId;
  photos?: string[];
  audioRef?: string | null;
  source?: 'self' | 'starter';
  joy?: number;
}

export class Repo {
  constructor(private store: LocalStore) {}

  // ---------- Treasure ----------

  listTreasures(status?: 'active' | 'archived'): Treasure[] {
    const all = this.store.loadTreasures().sort((a, b) => b.createdAt - a.createdAt);
    return status ? all.filter(t => t.status === status) : all;
  }

  get(id: string): Treasure | undefined {
    return this.store.loadTreasures().find(t => t.id === id);
  }

  create(input: NewTreasureInput): Treasure {
    const now = Date.now();
    const treasure: Treasure = {
      id: newId(),
      name: input.name.trim().slice(0, 20),
      sceneId: input.sceneId,
      tier: 'wish', // [硬约束 #4] 新条目一律 wish，晋级只能走回访确认
      joy: input.joy ?? 3,
      photos: (input.photos ?? []).slice(0, MAX_PHOTOS),
      audioRef: input.audioRef ?? null,
      notToday: null,
      status: 'active',
      source: input.source ?? 'self',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.store.saveTreasures([...this.store.loadTreasures(), treasure]);
    return treasure;
  }

  private patch(id: string, fn: (t: Treasure) => void): void {
    const list = this.store.loadTreasures();
    const t = list.find(x => x.id === id);
    if (!t) return;
    fn(t);
    t.updatedAt = Date.now();
    this.store.saveTreasures(list);
  }

  /** [硬约束 #15] 高频编辑，只动主表 */ // [硬约束 #9] updatedAt 供导入合并裁决
  setJoy(id: string, joy: number): void {
    this.patch(id, t => {
      t.joy = joy;
    });
  }

  /**
   * 统一编辑入口（闭环修复）：名字/场景/joy/备注/照片/语音引用。
   * 写错了不该只能删了重记——记忆应该可修正，但修正必须留痕（updatedAt）。
   */
  update(
    id: string,
    fields: Partial<Pick<Treasure, 'name' | 'sceneId' | 'joy' | 'note' | 'photos' | 'audioRef'>>
  ): void {
    this.patch(id, t => {
      if (typeof fields.name === 'string' && fields.name.trim()) t.name = fields.name.trim().slice(0, 20);
      if (typeof fields.sceneId === 'string') t.sceneId = fields.sceneId;
      if (typeof fields.joy === 'number') t.joy = Math.min(5, Math.max(1, Math.round(fields.joy)));
      if (fields.note !== undefined) {
        const trimmed = (fields.note || '').trim().slice(0, 50);
        t.note = trimmed || undefined;
      }
      if (Array.isArray(fields.photos)) t.photos = fields.photos.slice(0, MAX_PHOTOS);
      if (fields.audioRef !== undefined) t.audioRef = fields.audioRef;
    });
  }

  /** [硬约束 #8] 归档 = 收进抽屉，不是撕掉 */
  archive(id: string): void {
    this.patch(id, t => {
      t.status = 'archived';
      t.archivedAt = Date.now();
    });
  }

  restore(id: string): void {
    this.patch(id, t => {
      t.status = 'active';
      t.archivedAt = null;
    });
  }

  removeHard(id: string): void {
    this.store.saveTreasures(this.store.loadTreasures().filter(t => t.id !== id));
  }

  /** [硬约束 #7] 「今天不想」：当日有效，次日自动失效（存的是当日 0 点） */
  toggleNotToday(id: string, now = Date.now()): void {
    const today = startOfDay(now);
    this.patch(id, t => {
      t.notToday = t.notToday === today ? null : today;
    });
  }

  /** [硬约束 #9] 备注 ≤ 50 字——上限是刻意的，防止记录变成写作 */
  setNote(id: string, note: string): void {
    const trimmed = note.trim().slice(0, 50);
    this.patch(id, t => {
      t.note = trimmed || undefined;
    });
  }

  /** 自定义场景被删除时，把它的条目改派到预置场景，不让条目成为孤儿 */
  reassignScene(from: SceneId, to: SceneId): number {
    const list = this.store.loadTreasures();
    let moved = 0;
    for (const t of list) {
      if (t.sceneId === from) {
        t.sceneId = to;
        t.updatedAt = Date.now();
        moved++;
      }
    }
    if (moved > 0) this.store.saveTreasures(list);
    return moved;
  }

  // ---------- Draw ----------

  listDraws(): DrawRecord[] {
    return this.store.loadDraws().sort((a, b) => b.drawnAt - a.drawnAt);
  }

  recordDraw(p: {
    treasureId: string;
    mode: DrawMode;
    sceneFilter: SceneId | 'all';
    outcome: DrawOutcome;
    relaxed: RelaxLevel[];
  }): DrawRecord {
    const record: DrawRecord = { id: newId(), ...p, drawnAt: Date.now(), revisitAsked: 0 };
    this.store.saveDraws([...this.store.loadDraws(), record]);
    return record;
  }

  saveDraw(record: DrawRecord): void {
    const list = this.store.loadDraws();
    const i = list.findIndex(x => x.id === record.id);
    if (i >= 0) list[i] = record;
    this.store.saveDraws(list);
  }

  // ---------- Promotion（留存引擎） [硬约束 #4] ----------

  listPromotions(): Promotion[] {
    return this.store.loadPromotions();
  }

  /**
   * 回访晋级闭环 —— 留存引擎本体。
   * 找「昨日及更早被『就它了』的 wish、尚未晋级、回访卡未问满 3 次」的最近一笔。
   */
  pendingRevisit(now = Date.now()): { draw: DrawRecord; treasure: Treasure } | null {
    const treasures = new Map(this.store.loadTreasures().map(t => [t.id, t]));
    const promoted = new Set(this.store.loadPromotions().map(p => p.drawId));
    const TWENTY_HOURS = 20 * 3600 * 1000;
    const candidates = this.store
      .loadDraws()
      .filter(
        d =>
          d.outcome === 'accepted' &&
          !promoted.has(d.id) &&
          (d.revisitAsked ?? 0) < 3 &&
          now - d.drawnAt >= TWENTY_HOURS
      )
      .map(d => ({ draw: d, treasure: treasures.get(d.treasureId) }))
      .filter(
        (x): x is { draw: DrawRecord; treasure: Treasure } =>
          !!x.treasure && x.treasure.status === 'active' && x.treasure.tier === 'wish'
      )
      .sort((a, b) => b.draw.drawnAt - a.draw.drawnAt);
    return candidates[0] || null;
  }

  markRevisitAsked(draw: DrawRecord): void {
    draw.revisitAsked = (draw.revisitAsked ?? 0) + 1;
    this.saveDraw(draw);
  }

  /** 素描 → 烫金。唯一的晋级通道。 */
  promote(drawId: string, treasureId: string, now = Date.now()): Promotion {
    const promotion: Promotion = { id: newId(), treasureId, drawId, confirmedAt: now };
    this.store.savePromotions([...this.store.loadPromotions(), promotion]);
    this.patch(treasureId, t => {
      t.tier = 'verified';
    });
    return promotion;
  }

  // ---------- 导出 / 导入 [硬约束 #9] ----------

  /** 导出不含照片本体，只带 photos 引用 [硬约束 #15] */
  exportData(): ExportPayload {
    return {
      app: 'onetab',
      version: 1,
      exportedAt: Date.now(),
      treasures: this.store.loadTreasures(),
      draws: this.store.loadDraws(),
      promotions: this.store.loadPromotions(),
      customScenes: getCustomScenes(),
    };
  }

  /** 导入 = 合并语义（按 updatedAt 取新），绝不覆盖现有较新的数据 */
  importData(raw: unknown): MergeReport {
    const payload = normalizePayload(raw);
    const report: MergeReport = { added: 0, updated: 0, kept: 0 };
    if (payload.treasures) {
      const r = mergeById(this.store.loadTreasures(), payload.treasures, t => t.updatedAt);
      this.store.saveTreasures(r.merged);
      report.added += r.report.added;
      report.updated += r.report.updated;
      report.kept += r.report.kept;
    }
    if (payload.draws) {
      const r = mergeById(this.store.loadDraws(), payload.draws);
      this.store.saveDraws(r.merged);
    }
    if (payload.promotions) {
      const r = mergeById(this.store.loadPromotions(), payload.promotions);
      this.store.savePromotions(r.merged);
    }
    if (payload.customScenes) {
      mergeCustomScenes(payload.customScenes); // 合并语义：本地没有的补上，已有的保留
    }
    return report;
  }
}

/** 全局单例 */
export const repo = new Repo(new WxStorageStore());
