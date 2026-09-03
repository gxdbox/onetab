/**
 * 情侣共册客户端模块单元测试（需求 2-B）
 *
 * 覆盖：口令规范化、错误文案映射、创建/加入/退出后的房间状态缓存。
 * wx.cloud.callFunction 用内存版 mock（与 repo/prefs 测试同款手法）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRoom,
  errText,
  getCachedRoom,
  joinRoom,
  leaveRoom,
  normalizeCode,
} from '../miniprogram/sync/couple';

function createWxMock() {
  const storage = new Map<string, unknown>();
  let cloudResult: unknown = { result: {} };
  const wx = {
    getStorageSync: (key: string): unknown => (storage.has(key) ? storage.get(key) : ''),
    setStorageSync: (key: string, value: unknown): void => {
      storage.set(key, value);
    },
    cloud: {
      callFunction: async (): Promise<unknown> => cloudResult,
    },
  };
  return {
    wx,
    storage,
    setResult: (r: unknown): void => {
      cloudResult = r;
    },
  };
}

describe('couple 口令/文案（纯函数）', () => {
  it('normalizeCode 去空格并大写', () => {
    expect(normalizeCode(' ab3xyz ')).toBe('AB3XYZ');
  });

  it('errText 覆盖主要错误码与兜底', () => {
    expect(errText('room_not_found')).toBe('没找到这个口令，让 TA 核对一下');
    expect(errText('room_full')).toBe('这本共册已经满员了（两个人的册子）');
    expect(errText('already_in_room')).toBe('你已经在共册里了');
    expect(errText('bad_code')).toBe('口令是 6 位字母数字');
    expect(errText('not_member')).toBe('你还不是这本共册的成员');
    expect(errText(undefined)).toBe('出错了，稍后再试');
  });
});

describe('couple 房间状态缓存（wx.cloud mock）', () => {
  let m: ReturnType<typeof createWxMock>;

  beforeEach(() => {
    m = createWxMock();
    (globalThis as any).wx = m.wx;
  });

  it('默认没有房间缓存', () => {
    expect(getCachedRoom()).toBeNull();
  });

  it('createRoom 成功 → 缓存房间状态', async () => {
    m.setResult({ result: { ok: true, roomId: 'r1', code: 'AB3XYZ', members: ['u1'] } });
    const r = await createRoom();
    expect(r.ok).toBe(true);
    expect(r.room).toEqual({ roomId: 'r1', code: 'AB3XYZ', members: ['u1'] });
    expect(getCachedRoom()).toEqual({ roomId: 'r1', code: 'AB3XYZ', members: ['u1'] });
  });

  it('joinRoom 房间不存在 → 返回文案且不缓存', async () => {
    m.setResult({ result: { ok: false, error: 'room_not_found' } });
    const r = await joinRoom('AB3XYZ');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('没找到这个口令，让 TA 核对一下');
    expect(getCachedRoom()).toBeNull();
  });

  it('joinRoom 满员 → room_full 文案', async () => {
    m.setResult({ result: { ok: false, error: 'room_full' } });
    const r = await joinRoom('AB3XYZ');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('这本共册已经满员了（两个人的册子）');
  });

  it('leaveRoom 清空房间缓存', async () => {
    m.setResult({ result: { ok: true, roomId: 'r1', code: 'AB3XYZ', members: ['u1'] } });
    await createRoom();
    expect(getCachedRoom()).not.toBeNull();
    await leaveRoom();
    expect(getCachedRoom()).toBeNull();
  });
});
