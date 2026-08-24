/**
 * Repo 数据层单元测试 —— 不依赖 wx API（用内存版 wx mock + WxStorageStore）
 *
 * 覆盖：photos 多张创建/更新（≤3 截断）、旧数据 photoRef→photos 迁移、
 * 导入合并语义（updatedAt 取新）、回访晋级闭环。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Repo } from '../miniprogram/data/repo';
import { WxStorageStore } from '../miniprogram/data/store';
import { Treasure } from '../miniprogram/core/types';

/** 内存版 wx mock：只实现 repo/store 用到的 storage API */
function createWxMock() {
  const storage = new Map<string, unknown>();
  const wx = {
    getStorageSync: (key: string): unknown => (storage.has(key) ? storage.get(key) : ''),
    setStorageSync: (key: string, value: unknown): void => {
      storage.set(key, value);
    },
  };
  return { wx, storage };
}

describe('Repo photos 多张创建/更新 [硬约束 #15]', () => {
  let m: ReturnType<typeof createWxMock>;
  let repo: Repo;

  beforeEach(() => {
    m = createWxMock();
    (globalThis as any).wx = m.wx;
    repo = new Repo(new WxStorageStore());
  });

  it('create 传超过 3 张照片被截断到 3 张', () => {
    const t = repo.create({
      name: '面',
      sceneId: 'eat',
      photos: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
    });
    expect(t.photos).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('create 不传照片 → photos 为空数组', () => {
    const t = repo.create({ name: '面', sceneId: 'eat' });
    expect(t.photos).toEqual([]);
  });

  it('update 可替换为多张照片（≤3 截断）', () => {
    const t = repo.create({ name: '面', sceneId: 'eat', photos: ['a.jpg'] });
    repo.update(t.id, { photos: ['x.jpg', 'y.jpg', 'z.jpg', 'w.jpg'] });
    const updated = repo.get(t.id)!;
    expect(updated.photos).toEqual(['x.jpg', 'y.jpg', 'z.jpg']);
  });

  it('update 不传 photos 时不改变已有照片', () => {
    const t = repo.create({ name: '面', sceneId: 'eat', photos: ['a.jpg'] });
    repo.update(t.id, { joy: 5 });
    expect(repo.get(t.id)!.photos).toEqual(['a.jpg']);
  });
});

describe('旧数据 photoRef → photos 迁移 [硬约束 #15]', () => {
  it('带 photoRef 的旧条目被迁移为 photos: [photoRef] 并写回', () => {
    const m = createWxMock();
    // 预置旧格式数据（photoRef 单张，无 photos 字段）
    const legacy = {
      id: 'old1',
      name: '老条目',
      sceneId: 'eat',
      tier: 'wish',
      joy: 3,
      photoRef: 'local://photos/old.jpg',
      notToday: null,
      status: 'active',
      source: 'self',
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
    };
    m.wx.setStorageSync('onetab:treasures', [legacy]);
    (globalThis as any).wx = m.wx;
    const store = new WxStorageStore();

    const list = store.loadTreasures();
    expect(list[0].photos).toEqual(['local://photos/old.jpg']);

    // 已写回：再读一次也不重复迁移、数据稳定
    const again = store.loadTreasures();
    expect(again[0].photos).toEqual(['local://photos/old.jpg']);
  });

  it('photoRef 为空(null)的旧条目迁移为 photos: []', () => {
    const m = createWxMock();
    const legacy = {
      id: 'old2',
      name: '无照片',
      sceneId: 'eat',
      tier: 'wish',
      joy: 3,
      photoRef: null,
      notToday: null,
      status: 'active',
      source: 'self',
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
    };
    m.wx.setStorageSync('onetab:treasures', [legacy]);
    (globalThis as any).wx = m.wx;
    const store = new WxStorageStore();
    expect(store.loadTreasures()[0].photos).toEqual([]);
  });

  it('已是 photos 数组的新格式条目不被重复迁移', () => {
    const m = createWxMock();
    const fresh: Treasure = {
      id: 'new1',
      name: '新条目',
      sceneId: 'eat',
      tier: 'wish',
      joy: 3,
      photos: ['a.jpg', 'b.jpg'],
      notToday: null,
      status: 'active',
      source: 'self',
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
    };
    m.wx.setStorageSync('onetab:treasures', [fresh]);
    (globalThis as any).wx = m.wx;
    const store = new WxStorageStore();
    expect(store.loadTreasures()[0].photos).toEqual(['a.jpg', 'b.jpg']);
  });
});

describe('导入合并语义（updatedAt 取新）[硬约束 #9]', () => {
  let m: ReturnType<typeof createWxMock>;
  let repo: Repo;

  beforeEach(() => {
    m = createWxMock();
    (globalThis as any).wx = m.wx;
    repo = new Repo(new WxStorageStore());
  });

  function payload(name: string, updatedAt: number, photos: string[] = []) {
    return {
      app: 'onetab',
      version: 1,
      exportedAt: Date.now(),
      treasures: [
        {
          id: 'x',
          name,
          sceneId: 'eat',
          tier: 'wish',
          joy: 3,
          photos,
          notToday: null,
          status: 'active',
          source: 'self',
          createdAt: 1,
          updatedAt,
          archivedAt: null,
        },
      ],
      draws: [],
      promotions: [],
    };
  }

  it('导入数据较新（updatedAt 更大）→ 覆盖本地', () => {
    repo.create({ name: '本地旧', sceneId: 'eat' });
    const older = repo.get(repo.listTreasures()[0].id)!;
    // 直接构造同 id、较新的导入数据
    const newer = payload('导入新', older.updatedAt + 100, ['n.jpg']);
    newer.treasures[0].id = older.id;
    const report = repo.importData(newer);
    expect(report.updated).toBe(1);
    const t = repo.get(older.id)!;
    expect(t.name).toBe('导入新');
    expect(t.photos).toEqual(['n.jpg']);
  });

  it('导入数据较旧 → 保留本地（恢复旧备份不弄丢现有数据）', () => {
    const t = repo.create({ name: '本地较新', sceneId: 'eat' });
    const older = payload('旧备份', t.updatedAt - 100);
    older.treasures[0].id = t.id;
    const report = repo.importData(older);
    expect(report.kept).toBe(1);
    expect(repo.get(t.id)!.name).toBe('本地较新');
  });

  it('导入数据里不存在的本地条目 → 一律保留（合并不删除）', () => {
    const a = repo.create({ name: 'A', sceneId: 'eat' });
    const b = repo.create({ name: 'B', sceneId: 'eat' });
    const only = payload('仅B', Date.now() + 1000);
    only.treasures[0].id = b.id;
    repo.importData(only);
    const all = repo.listTreasures();
    expect(all.map(t => t.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('回访晋级闭环 [硬约束 #4]', () => {
  let m: ReturnType<typeof createWxMock>;
  let repo: Repo;

  beforeEach(() => {
    m = createWxMock();
    (globalThis as any).wx = m.wx;
    repo = new Repo(new WxStorageStore());
  });

  it('次日回访确认开心 → wish 晋级为 verified', () => {
    const t = repo.create({ name: '去山里', sceneId: 'far' });
    expect(t.tier).toBe('wish'); // 新条目一律 wish [硬约束 #4]

    // 昨天抽中并「就它了」
    const draw = repo.recordDraw({
      treasureId: t.id,
      mode: 'pool',
      sceneFilter: 'all',
      outcome: 'accepted',
      relaxed: [],
    });

    // 次日（20 小时后）：有 pendingRevisit
    const tomorrow = Date.now() + 21 * 3600 * 1000;
    const pending = repo.pendingRevisit(tomorrow);
    expect(pending).not.toBeNull();
    expect(pending!.treasure.id).toBe(t.id);

    // 确认开心 → 晋级
    repo.promote(draw.id, t.id, tomorrow);
    expect(repo.get(t.id)!.tier).toBe('verified');

    // 晋级后不再出现在 pendingRevisit
    expect(repo.pendingRevisit(tomorrow)).toBeNull();
  });

  it('未满 20 小时不弹回访卡', () => {
    const t = repo.create({ name: '今晚', sceneId: 'eat' });
    repo.recordDraw({
      treasureId: t.id,
      mode: 'pool',
      sceneFilter: 'all',
      outcome: 'accepted',
      relaxed: [],
    });
    expect(repo.pendingRevisit(Date.now())).toBeNull(); // 刚抽中，还没到 20 小时
  });
});
