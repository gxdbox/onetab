/**
 * 情侣共册客户端（需求 2-B）—— 云函数 couple 的薄封装 + 本地房间状态缓存
 *
 * [硬约束 #14] 本模块只负责「同步层」的房间身份，绝不碰数据层；
 * 本地数据的合并仍走 repo.importData（updatedAt 取新）。删掉 sync/ 目录 App 照跑。
 * 页面（情侣共册）可 import 本模块与 sync/index.ts——它是同步功能的 UI 出口。
 */
import { SYNC_ENV_ID } from './config';

export interface CoupleRoom {
  roomId: string;
  code: string;
  members: string[];
}

const KEY = 'onetab:coupleRoom';

/** 云同步是否已配置（config.ts 没填 env 时，情侣共册整个功能不出现） */
export function coupleEnabled(): boolean {
  return !!SYNC_ENV_ID;
}

function readRoom(): CoupleRoom | null {
  try {
    const v = wx.getStorageSync(KEY);
    return v && typeof v === 'object' && v.roomId && v.code ? (v as CoupleRoom) : null;
  } catch {
    return null;
  }
}

function writeRoom(r: CoupleRoom | null): void {
  try {
    wx.setStorageSync(KEY, r);
  } catch {
    // 缓存失败静默——下次 refreshRoom 会再拉
  }
}

/** 本地缓存的房间（无网络时也能让同步层知道「该往哪个快照走」） */
export function getCachedRoom(): CoupleRoom | null {
  return readRoom();
}

async function call(action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const res = await wx.cloud.callFunction({ name: 'couple', data: { action, ...payload } });
  return (res.result || {}) as Record<string, unknown>;
}

/** 6 位口令规范化：去空格、大写 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** 云函数错误码 → 用户能看懂的文案（纯函数，可单测） */
export function errText(error: string | undefined): string {
  switch (error) {
    case 'already_in_room':
      return '你已经在共册里了';
    case 'bad_code':
      return '口令是 6 位字母数字';
    case 'room_not_found':
      return '没找到这个口令，让 TA 核对一下';
    case 'room_full':
      return '这本共册已经满员了（两个人的册子）';
    case 'not_member':
      return '你还不是这本共册的成员';
    case 'no_data':
      return '没有可同步的数据';
    default:
      return '出错了，稍后再试';
  }
}

export async function createRoom(): Promise<{ ok: boolean; room?: CoupleRoom; error?: string }> {
  const r = await call('create');
  if (!r.ok) return { ok: false, error: errText(r.error as string) };
  const room: CoupleRoom = {
    roomId: r.roomId as string,
    code: r.code as string,
    members: (r.members as string[]) || [],
  };
  writeRoom(room);
  return { ok: true, room };
}

export async function joinRoom(codeRaw: string): Promise<{ ok: boolean; room?: CoupleRoom; error?: string }> {
  const r = await call('join', { code: normalizeCode(codeRaw) });
  if (!r.ok) return { ok: false, error: errText(r.error as string) };
  const room: CoupleRoom = {
    roomId: r.roomId as string,
    code: r.code as string,
    members: (r.members as string[]) || [],
  };
  writeRoom(room);
  return { ok: true, room };
}

export async function leaveRoom(): Promise<void> {
  try {
    await call('leave');
  } catch {
    // 服务端退出失败也清本地——至少本地不再指向共册
  }
  writeRoom(null);
}

/** 拉服务端确认房间状态（用于进页面时校验缓存是否还有效） */
export async function refreshRoom(): Promise<CoupleRoom | null> {
  try {
    const r = await call('myRoom');
    const room = (r.room as CoupleRoom | null) || null;
    writeRoom(room);
    return room;
  } catch {
    // 网络失败：回退到本地缓存，不把已加入的共册状态弄丢
    return readRoom();
  }
}
