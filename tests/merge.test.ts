/**
 * 合并语义单元测试 [硬约束 #9]
 * 恢复备份不该反而弄丢现有的东西——这句话的每半句都要有测试。
 */
import { describe, it, expect } from 'vitest';
import { mergeById, normalizePayload, normalizeTreasure } from '../miniprogram/core/merge';
import { Treasure } from '../miniprogram/core/types';

function t(id: string, updatedAt: number, p: Partial<Treasure> = {}): Treasure {
  return {
    id,
    name: id,
    sceneId: 'eat',
    tier: 'wish',
    joy: 3,
    photos: [],
    notToday: null,
    status: 'active',
    source: 'self',
    createdAt: 1,
    updatedAt,
    archivedAt: null,
    ...p,
  };
}

describe('mergeById [硬约束 #9]', () => {
  it('本地没有 → 新增', () => {
    const r = mergeById([t('a', 1)], [t('b', 2)], x => x.updatedAt);
    expect(r.merged.map(x => x.id).sort()).toEqual(['a', 'b']);
    expect(r.report.added).toBe(1);
  });

  it('导入数据较新（updatedAt 更大）→ 覆盖本地', () => {
    const newer = t('a', 100, { name: '新版' });
    const r = mergeById([t('a', 50)], [newer], x => x.updatedAt);
    expect(r.merged[0].name).toBe('新版');
    expect(r.report.updated).toBe(1);
  });

  it('本地较新 → 保留本地（恢复旧备份不弄丢现有数据）', () => {
    const older = t('a', 50, { name: '旧版' });
    const r = mergeById([t('a', 100, { name: '新版' })], [older], x => x.updatedAt);
    expect(r.merged[0].name).toBe('新版');
    expect(r.report.kept).toBe(1);
  });

  it('时间戳相同 → 保留本地', () => {
    const r = mergeById([t('a', 100, { name: '本地' })], [t('a', 100, { name: '导入' })], x => x.updatedAt);
    expect(r.merged[0].name).toBe('本地');
  });

  it('导入数据里不存在的本地条目 → 一律保留（合并不删除）', () => {
    const r = mergeById([t('a', 1), t('b', 1)], [t('a', 2)], x => x.updatedAt);
    expect(r.merged.map(x => x.id).sort()).toEqual(['a', 'b']);
  });

  it('无时间戳（draws/promotions）冲突 → 保留本地', () => {
    const local = { id: 'd1', value: 'local' };
    const incoming = { id: 'd1', value: 'incoming' };
    const r = mergeById([local], [incoming]);
    expect(r.merged[0].value).toBe('local');
    expect(r.report.kept).toBe(1);
  });
});

describe('导入数据规范化（不信任任何外部 JSON）', () => {
  it('缺 id 或 name 的条目被丢弃', () => {
    expect(normalizeTreasure({ name: '无名' }, 0)).toBeNull();
    expect(normalizeTreasure({ id: 'x' }, 0)).toBeNull();
    expect(normalizeTreasure(null, 0)).toBeNull();
  });

  it('非法字段被回退为安全默认值', () => {
    const n = normalizeTreasure(
      { id: 'x', name: '牛肉面', sceneId: 'hack', tier: 'god', joy: 99, status: 'weird', source: 'xxx' },
      0
    )!;
    expect(n.sceneId).toBe('eat');
    expect(n.tier).toBe('wish');
    expect(n.joy).toBe(5);
    expect(n.status).toBe('active');
    expect(n.source).toBe('self');
  });

  it('photos 只保留字符串引用、去重、≤3 张，不含照片本体 [硬约束 #15]', () => {
    const n = normalizeTreasure(
      { id: 'x', name: '面', photos: ['a.jpg', 'b.jpg', 42, 'a.jpg', 'c.jpg', 'd.jpg'] },
      0
    )!;
    expect(n.photos).toEqual(['a.jpg', 'b.jpg', 'c.jpg']); // 过滤非字符串、去重、≤3
    expect(JSON.stringify(n)).not.toContain('blob');
  });

  it('note 超长被截断到 50 字', () => {
    const n = normalizeTreasure({ id: 'x', name: '面', note: '长'.repeat(80) }, 0)!;
    expect(n.note!.length).toBe(50);
  });

  it('normalizePayload：坏段丢弃、好段保留，整份导入不失败', () => {
    const p = normalizePayload({
      treasures: [{ id: 'x', name: '面' }, { bad: true }, 'junk'],
      draws: [{ id: 'd', treasureId: 'x' }],
      promotions: 'not-an-array',
      customScenes: [
        { id: 'c:电影', emoji: '🎬', label: '电影' },
        { id: 'bad', emoji: 'x', label: 'y' }, // 非 c: 开头 → 丢弃
      ],
    });
    expect(p.treasures!.length).toBe(1);
    expect(p.draws!.length).toBe(1);
    expect(p.promotions).toBeUndefined();
    expect(p.customScenes).toEqual([{ id: 'c:电影', emoji: '🎬', label: '电影' }]);
  });

  it('normalizePayload：V1 旧版单值 customScene 兼容升级为列表', () => {
    const p = normalizePayload({ customScene: { id: 'custom', label: '遛娃' } });
    expect(p.customScenes).toEqual([{ id: 'c:遛娃', emoji: '⭐', label: '遛娃' }]);
  });

  it('normalizeTreasure：接受 c: 开头的自定义场景 id，非法场景回退 eat', () => {
    const custom = normalizeTreasure({ id: 'x', name: '电影', sceneId: 'c:电影' }, 0)!;
    expect(custom.sceneId).toBe('c:电影');
    const bad = normalizeTreasure({ id: 'y', name: '面', sceneId: 'hack' }, 0)!;
    expect(bad.sceneId).toBe('eat');
  });
});
