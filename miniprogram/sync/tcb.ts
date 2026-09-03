/**
 * TcbSyncAdapter —— 微信云开发（TCB）同步适配器（V2 + 需求 2-B 情侣共册）
 *
 * 架构立场 [硬约束 #14]：
 *   - 方向永远是「同步层 → 数据层」：本模块读 repo.exportData() / 调 repo.importData()，
 *     data/ 目录对 sync/ 一无所知。
 *   - 云端只是一份快照，不是真相。拉取也走合并语义（按 updatedAt 取新）[硬约束 #9]——
 *     云上较旧的数据永远不能覆盖本地较新的数据。
 *   - 所有失败静默降级：同步挂了，本地一切照常。
 *
 * 同步目标（二选一）：
 *   - 加入情侣共册 → 共享快照 onetab_snapshots/{roomId}（经 couple 云函数读写，服务端校验成员）
 *   - 未加入 → 个人快照 onetab_snapshots/{openid}（客户端直连）
 *
 * 启用步骤（见 config.ts）：
 *   1. 开通微信云开发，创建环境
 *   2. 创建集合 onetab_rooms + onetab_snapshots
 *   3. 部署 login（返回 openid）与 couple（房间 + 共享快照）两个云函数
 *   4. 在 config.ts 填入环境 ID
 */
import { repo } from '../data/repo';
import { SYNC_COLLECTION } from './config';
import { getCachedRoom } from './couple';
import type { SyncAdapter } from './index';

/** 用户身份：openid（来自 login 云函数），失败则退化为本地随机 ID（不跨设备，但同设备稳定） */
function localFallbackId(): string {
  const KEY = 'onetab:syncUserId';
  try {
    let id = wx.getStorageSync(KEY);
    if (!id) {
      id = 'local-' + Math.random().toString(36).slice(2, 10);
      wx.setStorageSync(KEY, id);
    }
    return id as string;
  } catch {
    return 'local-anonymous';
  }
}

async function userId(): Promise<string> {
  try {
    const res = await wx.cloud.callFunction({ name: 'login' });
    const openid = (res.result as { openid?: string })?.openid;
    return openid || localFallbackId();
  } catch {
    return localFallbackId();
  }
}

/** 同步目标：房间优先（情侣共册），否则个人快照 */
async function snapshotTarget(): Promise<{ kind: 'room' | 'personal'; id: string }> {
  const room = getCachedRoom();
  if (room && room.roomId) return { kind: 'room', id: room.roomId };
  return { kind: 'personal', id: await userId() };
}

export function createTcbSyncAdapter(): SyncAdapter {
  return {
    name: 'tcb',
    /** 拉云端快照 → 合并进本地（绝不覆盖较新的本地数据） */
    async pull(): Promise<void> {
      const target = await snapshotTarget();
      try {
        if (target.kind === 'room') {
          // 共享快照经云函数读写：服务端已校验成员身份
          const res = await wx.cloud.callFunction({
            name: 'couple',
            data: { action: 'getSnapshot', roomId: target.id },
          });
          const result = (res.result || {}) as { ok?: boolean; data?: unknown };
          if (result.ok && result.data) repo.importData(result.data);
        } else {
          const db = wx.cloud.database();
          const doc = await db.collection(SYNC_COLLECTION).doc(target.id).get();
          // 文档结构 { _id, data: <exportPayload> }——解包后再合并
          const payload = (doc.data as { data?: unknown } | null)?.data;
          if (payload) repo.importData(payload);
        }
      } catch {
        // 云端还没有快照（首次登录）或网络失败——本地数据一个字不动
      }
    },
    /** 本地快照 → 全量推云端（快照语义，云端没有合并职责） */
    async push(): Promise<void> {
      const target = await snapshotTarget();
      const data = repo.exportData();
      try {
        if (target.kind === 'room') {
          await wx.cloud.callFunction({
            name: 'couple',
            data: { action: 'putSnapshot', roomId: target.id, data },
          });
        } else {
          const db = wx.cloud.database();
          await db.collection(SYNC_COLLECTION).doc(target.id).set({ data });
        }
      } catch {
        // 推送失败无所谓，下次 onHide 再试
      }
    },
  };
}
