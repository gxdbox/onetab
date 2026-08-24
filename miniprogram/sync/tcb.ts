/**
 * TcbSyncAdapter —— 微信云开发（TCB）同步适配器（V2）
 *
 * 架构立场 [硬约束 #14]：
 *   - 方向永远是「同步层 → 数据层」：本模块读 repo.exportData() / 调 repo.importData()，
 *     data/ 目录对 sync/ 一无所知。
 *   - 云端只是一份快照，不是真相。拉取也走合并语义（按 updatedAt 取新）[硬约束 #9]——
 *     云上较旧的数据永远不能覆盖本地较新的数据。
 *   - 所有失败静默降级：同步挂了，本地一切照常。
 *
 * 启用步骤（见 config.ts）：
 *   1. 开通微信云开发，创建环境
 *   2. 创建集合 onetab_snapshots（权限：仅创建者可读写）
 *   3. 部署一个名为 login 的云函数返回 openid（用户身份，即文档 ID）
 *   4. 在 config.ts 填入环境 ID
 */
import { repo } from '../data/repo';
import { SYNC_COLLECTION } from './config';
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

export function createTcbSyncAdapter(): SyncAdapter {
  return {
    name: 'tcb',
    /** 拉云端快照 → 合并进本地（绝不覆盖较新的本地数据） */
    async pull(): Promise<void> {
      const uid = await userId();
      try {
        const db = wx.cloud.database();
        const doc = await db.collection(SYNC_COLLECTION).doc(uid).get();
        repo.importData(doc.data);
      } catch {
        // 云端还没有快照（首次登录）或网络失败——本地数据一个字不动
      }
    },
    /** 本地快照 → 全量推云端（快照语义，云端没有合并职责） */
    async push(): Promise<void> {
      const uid = await userId();
      try {
        const db = wx.cloud.database();
        await db.collection(SYNC_COLLECTION).doc(uid).set({ data: repo.exportData() });
      } catch {
        // 推送失败无所谓，下次 onHide 再试
      }
    },
  };
}
