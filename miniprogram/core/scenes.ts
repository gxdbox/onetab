/**
 * 场景 —— 决策是有语境的（中午十二点的池子里不该出现「去拉萨」）
 *
 * [硬约束 #2] 场景有默认值（eat），添加条目时用户可以完全不碰——默认路径零配置。
 * V1 预置四个，不可增删：自定义场景是「分类整理欲」的入口，整理是收集的反面。
 */
import { SceneId } from './types';

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

/**
 * 自定义场景占位（V1.5）：最多一个，标签存偏好层（data/prefs.ts）。
 * 预置四个不可增删；自定义是给「遛娃」「摒猫」这类个性化语境的窄门。
 */
export const CUSTOM_SCENE: Scene = { id: 'custom', emoji: '⭐', label: '自定义' };

export function sceneOf(id: SceneId): Scene {
  if (id === 'custom') return CUSTOM_SCENE;
  return SCENES.find(s => s.id === id) || SCENES[0];
}
