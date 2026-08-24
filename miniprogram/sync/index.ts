/**
 * 可插拔同步层 [硬约束 #14]
 *
 * 铁律：数据层（core/ data/）与所有页面严禁 import 本目录。
 *   整个删掉 sync/ 目录，App 依然能跑——现在就可以试。
 *
 * V2：填好 config.ts 的 SYNC_ENV_ID 后自动切换到 TcbSyncAdapter（跨设备快照同步），
 * 拉取同样走合并语义，云上较旧的数据永远盖不过本地较新的数据。
 * 只有 App 壳（app.ts）被允许 import 本目录。
 */
import { SYNC_ENV_ID } from './config';
import { createTcbSyncAdapter } from './tcb';

export interface SyncAdapter {
  readonly name: string;
  pull(): Promise<void>;
  push(): Promise<void>;
}

export const noopSync: SyncAdapter = {
  name: 'noop',
  async pull(): Promise<void> {},
  async push(): Promise<void> {},
};

function createSync(): SyncAdapter {
  if (!SYNC_ENV_ID) return noopSync; // 默认关闭：本地是唯一真相
  try {
    wx.cloud.init({ env: SYNC_ENV_ID, traceUser: true });
    return createTcbSyncAdapter();
  } catch {
    return noopSync; // 云能力不可用 → 静默回退
  }
}

export const sync: SyncAdapter = createSync();
