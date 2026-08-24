/**
 * 语音速记独立存储（V2）—— P2 在语音场景的极限压缩
 *
 * 与照片同构 [硬约束 #15]：音频存独立文件目录，主表只存 audioRef（文件路径），
 * 导出 JSON 不带音频本体。上限 15 秒是刻意的——「说一句」不是「录一段」。
 */
import { newId } from '../core/id';

/** 语音上限：15 秒 */
export const VOICE_MAX_MS = 15000;

function audioDir(): string {
  return `${wx.env.USER_DATA_PATH}/audio`;
}

export function ensureAudioDir(): void {
  try {
    wx.getFileSystemManager().mkdirSync(audioDir(), true);
  } catch {
    // 已存在则忽略
  }
}

/** 把录音临时文件存入独立目录，返回 audioRef（即文件路径） */
export function saveAudio(tempPath: string): string {
  const dest = `${audioDir()}/${newId()}.aac`;
  try {
    wx.getFileSystemManager().saveFileSync(tempPath, dest);
    return dest;
  } catch {
    return tempPath;
  }
}

export function audioPath(ref?: string | null): string {
  return ref || '';
}

export function removeAudio(ref?: string | null): void {
  if (!ref) return;
  try {
    wx.getFileSystemManager().unlinkSync(ref);
  } catch {
    // 文件不存在则忽略
  }
}
