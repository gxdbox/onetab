/**
 * LocalStore —— 本地存储接口抽象 [硬约束 #14]
 *
 * 本地存储是唯一真相来源（source of truth）；登录/同步是后加的可插拔层。
 * 硬约束原文的落地形态是浏览器环境的 IndexedDB / Dexie；微信小程序没有 IndexedDB，
 * 架构原则原样生效，实现映射为本文件的 wx storage 适配器。
 * 若产品未来以 H5/PWA 交付，替换为 Dexie 实现即可——core/ 与 ui/ 一行不改。
 */
import { DrawRecord, Promotion, Treasure } from '../core/types';

export interface LocalStore {
  loadTreasures(): Treasure[];
  saveTreasures(list: Treasure[]): void;
  loadDraws(): DrawRecord[];
  saveDraws(list: DrawRecord[]): void;
  loadPromotions(): Promotion[];
  savePromotions(list: Promotion[]): void;
}

const KEYS = {
  treasures: 'onetab:treasures',
  draws: 'onetab:draws',
  promotions: 'onetab:promotions',
};

/** 微信小程序环境的 LocalStore 实现 */
export class WxStorageStore implements LocalStore {
  private read<T>(key: string, fallback: T): T {
    try {
      const v = wx.getStorageSync(key);
      return v === '' || v == null ? fallback : (v as T);
    } catch {
      return fallback;
    }
  }

  loadTreasures(): Treasure[] {
    const list = this.read<Treasure[]>(KEYS.treasures, []);
    // 旧数据迁移（photoRef 单张 → photos 数组）[硬约束 #15]：
    // 发现任一元素带 photoRef（且 photos 不是数组）时，迁移为 photos: [photoRef] 并尝试写回。
    // 写回失败不阻塞读取，下次再试。逐条处理，兼容已迁移的条目。
    let changed = false;
    const migrated = list.map(t => {
      if (t && typeof t === 'object' && !Array.isArray((t as Treasure).photos)) {
        const raw = t as unknown as { photoRef?: string | null };
        (t as Treasure).photos = raw.photoRef ? [raw.photoRef] : [];
        changed = true;
      }
      return t;
    });
    if (changed) {
      try {
        wx.setStorageSync(KEYS.treasures, migrated);
      } catch {
        // 写回失败：下次读取再迁一次
      }
    }
    return migrated;
  }
  saveTreasures(list: Treasure[]): void {
    wx.setStorageSync(KEYS.treasures, list);
  }
  loadDraws(): DrawRecord[] {
    return this.read<DrawRecord[]>(KEYS.draws, []);
  }
  saveDraws(list: DrawRecord[]): void {
    wx.setStorageSync(KEYS.draws, list);
  }
  loadPromotions(): Promotion[] {
    return this.read<Promotion[]>(KEYS.promotions, []);
  }
  savePromotions(list: Promotion[]): void {
    wx.setStorageSync(KEYS.promotions, list);
  }
}
