/**
 * 「指到你了」—— 收集小确幸，选不出来时闭眼一指
 *
 * [硬约束 #14] 本地优先：本地存储是唯一真相来源。
 *   登录/同步是后加的可插拔层（见 sync/index.ts）——
 *   整个删掉 sync/ 目录，本文件与所有页面照常工作。
 *   只有这个 App 壳被允许 import sync/。
 */
import { ensurePhotoDir } from './photos/photoStore';
import { ensureAudioDir } from './audio/audioStore';
import { sync } from './sync';

App({
  onLaunch() {
    ensurePhotoDir(); // [硬约束 #15] 照片独立目录，与主表数据分离
    ensureAudioDir(); // [硬约束 #15] 语音同构：独立目录
  },

  onShow() {
    // 云同步（若启用）：进前台拉一次快照，合并进本地。失败静默。
    sync.pull().catch(() => {});
  },

  onHide() {
    // 离前台推一次快照。失败静默——下次再试，本地数据不受影响。
    sync.push().catch(() => {});
  },
});
