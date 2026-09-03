/**
 * 偏好存储（V1.5）—— 自定义场景 / 记住的筛选 / 仪式偏好
 *
 * [硬约束 #2]  默认路径零配置：这些全是用户主动设置才存在，默认值即零配置状态。
 * [硬约束 #16] 记住的筛选必须在主路径可见（首页 chips），隐形的残留条件会让
 *              「0 个候选」看起来像程序坏了。
 * 自定义场景：可增删多个（label ≤ 4 字 + 同名去重），用长度挡住分类整理欲
 * （整理是收集的反面）；id 一律 `c:` 前缀，与预置四场景永不冲突。
 */
import { Scene, SCENES, isPresetSceneId } from '../core/scenes';
import { CustomScene, DrawMode, SceneId } from '../core/types';

const KEYS = {
  /** 旧版单值自定义场景（V1.5），读到时自动迁移到 customScenes */
  customScene: 'onetab:customScene',
  customScenes: 'onetab:customScenes',
  filters: 'onetab:filters',
  ritual: 'onetab:ritual',
};

export interface RememberedFilters {
  mode: DrawMode;
  sceneFilter: SceneId | 'all';
}

export type RitualDuration = 'brisk' | 'standard' | 'grand';
export type RitualSkin = 'classic' | 'cinnabar';

export interface RitualPrefs {
  duration: RitualDuration;
  skin: RitualSkin;
}

export const RITUAL_DURATION_MS: Record<RitualDuration, number> = {
  brisk: 1000, // 轻快
  standard: 1600, // 标准
  grand: 2400, // 隆重
};

export const RITUAL_DURATION_LABEL: Record<RitualDuration, string> = {
  brisk: '轻快',
  standard: '标准',
  grand: '隆重',
};

export const RITUAL_SKIN_LABEL: Record<RitualSkin, string> = {
  classic: '暖纸',
  cinnabar: '朱砂',
};

function read<T>(key: string): T | null {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v == null ? null : (v as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    wx.setStorageSync(key, value);
  } catch {
    // 存储失败静默——偏好丢了不该影响主流程
  }
}

// ---------- 自定义场景（可增删多个） ----------

/** 自定义场景 label 上限：≤ 4 字——用长度挡住分类整理欲的窄门 */
export const CUSTOM_SCENE_LABEL_MAX = 4;
/** 记一个页内联创建时供挑选的 emoji 候选 */
export const CUSTOM_SCENE_EMOJIS = ['⭐', '🎬', '🎧', '🧒', '🐱', '🏀', '📖', '💻', '🍰', '🌙'];

/** 自定义场景 id：`c:` + label。label 去重保证 id 唯一。 */
function customSceneId(label: string): string {
  return `c:${label}`;
}

/** 旧版单值 customScene → 数组迁移：老用户升级后第一次读取即自动迁移，幂等 */
function migrateLegacyCustomScene(): void {
  const legacy = read<{ id: string; label: string }>(KEYS.customScene);
  if (!legacy || typeof legacy.label !== 'string' || !legacy.label) return;
  const name = legacy.label.trim().slice(0, CUSTOM_SCENE_LABEL_MAX);
  const list = read<CustomScene[]>(KEYS.customScenes) ?? [];
  if (name && !list.some(s => s.id === customSceneId(name))) {
    write(KEYS.customScenes, [...list, { id: customSceneId(name), emoji: '⭐', label: name }]);
  }
  write(KEYS.customScene, null); // 迁移后清掉旧键，避免重复迁移
}

export function getCustomScenes(): CustomScene[] {
  migrateLegacyCustomScene();
  const list = read<CustomScene[]>(KEYS.customScenes);
  if (!Array.isArray(list)) return [];
  // 容错：丢弃脏数据（缺 id/label/emoji 的）
  return list.filter(
    (s): s is CustomScene =>
      !!s &&
      typeof s.id === 'string' &&
      typeof s.label === 'string' &&
      !!s.label &&
      typeof s.emoji === 'string'
  );
}

/** 新增自定义场景；label 重复时返回 null（调用方提示「已存在」） */
export function addCustomScene(label: string, emoji: string = '⭐'): CustomScene | null {
  const name = label.trim().slice(0, CUSTOM_SCENE_LABEL_MAX);
  if (!name) return null;
  const list = getCustomScenes();
  if (list.some(s => s.label === name)) return null; // 同名去重
  const scene: CustomScene = { id: customSceneId(name), emoji, label: name };
  write(KEYS.customScenes, [...list, scene]);
  return scene;
}

export function removeCustomScene(id: string): void {
  write(KEYS.customScenes, getCustomScenes().filter(s => s.id !== id));
}

/** 导入合并：本地没有的自定义场景补上，已有的保留本地——不让备份把删掉的场景复活 */
export function mergeCustomScenes(incoming: CustomScene[]): void {
  if (!Array.isArray(incoming) || incoming.length === 0) return;
  const existing = getCustomScenes();
  const haveId = new Set(existing.map(s => s.id));
  const haveLabel = new Set(existing.map(s => s.label));
  const add = incoming.filter(s => !haveId.has(s.id) && !haveLabel.has(s.label));
  if (add.length > 0) write(KEYS.customScenes, [...existing, ...add]);
}

/** 场景 chips = 预置四个 + 所有自定义场景（记一个页 / 首页抽屉 / 编辑页共用） */
export function getSceneChips(): Scene[] {
  return [...SCENES, ...getCustomScenes()];
}

/** 解析任意场景 id（预置或自定义）→ Scene；未知返回 null。页面渲染 emoji/label 用。 */
export function getSceneById(id: SceneId): Scene | null {
  if (isPresetSceneId(id)) return SCENES.find(s => s.id === id) ?? null;
  return getCustomScenes().find(s => s.id === id) ?? null;
}

// ---------- 记住的筛选 [硬约束 #16] ----------

export function getRememberedFilters(): RememberedFilters {
  const v = read<RememberedFilters>(KEYS.filters);
  if (!v) return { mode: 'pool', sceneFilter: 'all' }; // 默认零配置
  const mode: DrawMode = v.mode === 'safe' ? 'safe' : 'pool';
  const sceneFilter =
    v.sceneFilter === 'all' ||
    isPresetSceneId(v.sceneFilter) ||
    getCustomScenes().some(s => s.id === v.sceneFilter)
      ? v.sceneFilter
      : 'all';
  return { mode, sceneFilter };
}

export function setRememberedFilters(f: RememberedFilters): void {
  write(KEYS.filters, f);
}

// ---------- 仪式偏好（时长 / 皮肤） ----------

export function getRitual(): RitualPrefs {
  const v = read<RitualPrefs>(KEYS.ritual);
  const duration: RitualDuration =
    v && (v.duration === 'brisk' || v.duration === 'grand') ? v.duration : 'standard';
  const skin: RitualSkin = v && v.skin === 'cinnabar' ? 'cinnabar' : 'classic';
  return { duration, skin };
}

export function setRitual(r: RitualPrefs): void {
  write(KEYS.ritual, r);
}
