/**
 * 偏好存储（V1.5）—— 自定义场景 / 记住的筛选 / 仪式偏好
 *
 * [硬约束 #2]  默认路径零配置：这些全是用户主动设置才存在，默认值即零配置状态。
 * [硬约束 #16] 记住的筛选必须在主路径可见（首页 chips），隐形的残留条件会让
 *              「0 个候选」看起来像程序坏了。
 * 自定义场景上限一个：用数量上限挡住分类整理欲（整理是收集的反面）。
 */
import { Scene, SCENES } from '../core/scenes';
import { DrawMode, SceneId } from '../core/types';

const KEYS = {
  customScene: 'onetab:customScene',
  filters: 'onetab:filters',
  ritual: 'onetab:ritual',
};

export interface CustomScenePref {
  id: 'custom';
  label: string; // ≤ 4 字，如「遛娃」「撸猫」
}

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

// ---------- 自定义场景（最多一个） ----------

export function getCustomScene(): CustomScenePref | null {
  const v = read<CustomScenePref>(KEYS.customScene);
  return v && typeof v.label === 'string' && v.label ? { id: 'custom', label: v.label.slice(0, 4) } : null;
}

export function setCustomScene(label: string): CustomScenePref {
  const pref: CustomScenePref = { id: 'custom', label: label.trim().slice(0, 4) };
  write(KEYS.customScene, pref);
  return pref;
}

export function removeCustomScene(): void {
  write(KEYS.customScene, null);
}

/** 场景 chips = 预置四个 + 自定义（若已创建） */
export function getSceneChips(): Scene[] {
  const custom = getCustomScene();
  return custom ? [...SCENES, { id: 'custom' as SceneId, emoji: '⭐', label: custom.label }] : [...SCENES];
}

// ---------- 记住的筛选 [硬约束 #16] ----------

export function getRememberedFilters(): RememberedFilters {
  const v = read<RememberedFilters>(KEYS.filters);
  if (!v) return { mode: 'pool', sceneFilter: 'all' }; // 默认零配置
  const mode: DrawMode = v.mode === 'safe' ? 'safe' : 'pool';
  const sceneFilter =
    v.sceneFilter === 'all' || ['eat', 'play', 'far', 'rest', 'custom'].includes(v.sceneFilter)
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
