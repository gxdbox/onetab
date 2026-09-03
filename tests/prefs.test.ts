/**
 * 自定义场景偏好层单元测试（需求 1：单值 → 可增删多个）
 *
 * 覆盖：增删多个 / 同名去重 / label 截断 / 预置+自定义解析 /
 * 导入合并（本地没有的补上）/ 旧版单值 customScene 自动迁移。
 * 用内存版 wx mock（与 tests/repo.test.ts 同款手法）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addCustomScene,
  getCustomScenes,
  getSceneById,
  getSceneChips,
  mergeCustomScenes,
  removeCustomScene,
} from '../miniprogram/data/prefs';

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

describe('自定义场景（可增删多个）', () => {
  let m: ReturnType<typeof createWxMock>;

  beforeEach(() => {
    m = createWxMock();
    (globalThis as any).wx = m.wx;
  });

  it('默认没有自定义场景，chips 只有预置四场景', () => {
    expect(getCustomScenes()).toEqual([]);
    expect(getSceneChips().map(s => s.id)).toEqual(['eat', 'play', 'far', 'rest']);
  });

  it('addCustomScene 可新增多个，id 为 c:label', () => {
    const a = addCustomScene('电影', '🎬')!;
    const b = addCustomScene('遛娃')!;
    expect(a.id).toBe('c:电影');
    expect(a.emoji).toBe('🎬');
    expect(b.id).toBe('c:遛娃');
    expect(b.emoji).toBe('⭐');
    expect(getCustomScenes().length).toBe(2);
  });

  it('同名去重：重复 label 返回 null 且不重复入库', () => {
    addCustomScene('电影', '🎬');
    const dup = addCustomScene('电影', '🍿');
    expect(dup).toBeNull();
    expect(getCustomScenes().length).toBe(1);
  });

  it('label 超过 4 字被截断', () => {
    const s = addCustomScene('五个字场景')!;
    expect(s.label).toBe('五个字场');
    expect(s.id).toBe('c:五个字场');
  });

  it('removeCustomScene 只删指定场景', () => {
    addCustomScene('电影');
    addCustomScene('遛娃');
    removeCustomScene('c:电影');
    expect(getCustomScenes().map(s => s.label)).toEqual(['遛娃']);
  });

  it('getSceneById 解析预置与自定义，未知返回 null', () => {
    addCustomScene('电影', '🎬');
    expect(getSceneById('eat')!.label).toBe('吃什么');
    expect(getSceneById('c:电影')!.emoji).toBe('🎬');
    expect(getSceneById('c:不存在')).toBeNull();
  });

  it('mergeCustomScenes 只补本地没有的（按 id 与 label，不覆盖已有）', () => {
    addCustomScene('电影', '🎬');
    mergeCustomScenes([
      { id: 'c:电影', emoji: '🍿', label: '电影' }, // 已有 → 保留本地
      { id: 'c:遛娃', emoji: '⭐', label: '遛娃' }, // 没有 → 补上
    ]);
    const list = getCustomScenes();
    expect(list.length).toBe(2);
    expect(list.find(s => s.id === 'c:电影')!.emoji).toBe('🎬');
  });

  it('旧版单值 customScene 自动迁移为数组且幂等', () => {
    m.wx.setStorageSync('onetab:customScene', { id: 'custom', label: '遛娃' });
    const list = getCustomScenes();
    expect(list).toEqual([{ id: 'c:遛娃', emoji: '⭐', label: '遛娃' }]);
    expect(getCustomScenes().length).toBe(1); // 再读不重复迁移
  });
});
