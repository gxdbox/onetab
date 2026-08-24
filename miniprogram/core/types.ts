/**
 * 领域模型 —— 产品的宪法（PRODUCT_SPEC.md §3）
 *
 * [硬约束 #4]  信任分级：tier 只能由「回访确认开心」从 wish 晋级到 verified，单向。
 *              这个晋级闭环就是留存引擎，不是推送通知。
 * [硬约束 #8]  status: archived 必须可撤销，且有独立的「抽屉」视图。
 * [硬约束 #9]  updatedAt 是导入合并语义（按 updatedAt 取新）的裁决字段（V1.5）。
 * [硬约束 #15] photos 只存引用（文件路径数组，≤3 张），绝不内嵌照片数据。
 */

export type SceneId = 'eat' | 'play' | 'far' | 'rest' | 'custom';
/** 类别（justThisOne 体系的收藏分类）：add 页自动猜测用，与 PWA 版 lib/types.ts 一致 */
export type Category = 'food' | 'place' | 'activity' | 'thing' | 'media' | 'micro';
export type Tier = 'wish' | 'verified';
export type TreasureStatus = 'active' | 'archived';
export type DrawMode = 'pool' | 'safe';
export type DrawOutcome = 'accepted' | 'rerolled';
export type TreasureSource = 'self' | 'starter';
export type RelaxLevel = 'scene' | 'notToday';

export interface Treasure {
  id: string;
  name: string;
  sceneId: SceneId;
  /** 信任分级 [硬约束 #4]。新条目一律 wish；晋级只能走回访确认。 */
  tier: Tier;
  /** 开心程度 1-5，加权抽签的输入 [硬约束 #3]。高频编辑字段，绝不能触发照片重写 [硬约束 #15]。 */
  joy: number;
  /** 照片引用数组（≤3 张）：只存文件路径，不存数据 [硬约束 #15]。与 PWA 版 MAX_PHOTOS_PER_ITEM 一致。 */
  photos: string[];
  /** 语音速记（V2）：≤ 15s 的 AAC 文件路径，与照片同构 [硬约束 #15] */
  audioRef?: string | null;
  note?: string;
  /** 「今天不想」生效日的 0 点时间戳，次日自动失效 [硬约束 #7] */
  notToday: number | null;
  status: TreasureStatus;
  source: TreasureSource;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface DrawRecord {
  id: string;
  treasureId: string;
  mode: DrawMode;
  sceneFilter: SceneId | 'all';
  outcome: DrawOutcome;
  /** 只有真的换来新候选的放宽才记录 [硬约束 #5] */
  relaxed: RelaxLevel[];
  drawnAt: number;
  /** 回访卡最多问 3 次——不催，催促是负罪感营销的近亲 */
  revisitAsked: number;
}

export interface Promotion {
  id: string;
  treasureId: string;
  drawId: string;
  /** 素描变烫金的时刻 */
  confirmedAt: number;
}

export interface DrawContext {
  /** 注入时钟 [硬约束 #13] */
  now: number;
  mode: DrawMode;
  sceneFilter: SceneId | 'all';
  /** 本次会话内被重摇跳过的条目 [硬约束 #1] */
  sessionExcluded: string[];
  draws: DrawRecord[];
}

export interface DrawResult {
  treasure: Treasure | null;
  relaxed: RelaxLevel[];
  reason?: 'empty' | 'safe-empty';
}
