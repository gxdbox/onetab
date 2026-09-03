/**
 * 场景 —— 决策是有语境的（中午十二点的池子里不该出现「去拉萨」）
 *
 * [硬约束 #2] 场景有默认值（eat），添加条目时用户可以完全不碰——默认路径零配置。
 * 预置四个 + 可增删的多个自定义场景（id 以 `c:` 开头，存偏好层 data/prefs.ts）。
 * 自定义场景是给「遛娃」「电影」这类个性化语境的窄门；core 层保持零依赖，
 * 自定义场景的 emoji/label 由 data 层（getSceneById）负责解析。
 */
import { PresetSceneId, SceneId } from './types';

export interface Scene {
  id: SceneId;
  emoji: string;
  label: string;
}

export const SCENES: Scene[] = [
  { id: 'eat', emoji: '🍜', label: '吃什么' },
  { id: 'play', emoji: '🎉', label: '玩什么' },
  { id: 'far', emoji: '✈️', label: '去远方' },
  { id: 'rest', emoji: '💆', label: '休息一下' },
];

export const DEFAULT_SCENE: SceneId = 'eat';

export const PRESET_SCENE_IDS: PresetSceneId[] = ['eat', 'play', 'far', 'rest'];

/** 自定义场景 id 一律以 `c:` 开头——永不与预置 id 冲突 */
export function isCustomSceneId(id: string): boolean {
  return id.startsWith('c:');
}

export function isPresetSceneId(id: string): id is PresetSceneId {
  return (PRESET_SCENE_IDS as string[]).includes(id);
}

/** 只解析预置场景。自定义场景请用 data 层的 getSceneById。 */
export function sceneOf(id: SceneId): Scene {
  return SCENES.find(s => s.id === id) || SCENES[0];
}
