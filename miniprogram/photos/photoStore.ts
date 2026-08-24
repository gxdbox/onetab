/**
 * 照片独立存储 [硬约束 #15]
 *
 * 照片压缩后存独立文件目录，主表只存 photos 引用（文件路径数组）。
 * 原因：更新整行会重写数据——每次改星级/归档都拖着重写一遍照片，列表页会肉眼可见地卡。
 * （浏览器环境对应形态：独立的 Dexie 表，导出 JSON 不带 Blob 只带 id——见 V1.5 导出。）
 */
import { newId } from '../core/id';

/** 每件小确幸最多几张照片 [硬约束 #15] —— 与 PWA 版 MAX_PHOTOS_PER_ITEM 一致 */
export const MAX_PHOTOS_PER_ITEM = 3;

function photoDir(): string {
  return `${wx.env.USER_DATA_PATH}/photos`;
}

export function ensurePhotoDir(): void {
  try {
    wx.getFileSystemManager().mkdirSync(photoDir(), true);
  } catch {
    // 已存在则忽略
  }
}

/** 压缩后存入独立目录，返回 photoRef（即文件路径） */
export async function savePhoto(tempPath: string): Promise<string> {
  let src = tempPath;
  try {
    const res = await wx.compressImage({ src, quality: 60 });
    src = res.tempFilePath;
  } catch {
    // 压缩失败就用原图
  }
  const dest = `${photoDir()}/${newId()}.jpg`;
  try {
    wx.getFileSystemManager().saveFileSync(src, dest);
    return dest;
  } catch {
    return tempPath;
  }
}

export function photoPath(ref?: string | null): string {
  return ref || '';
}

export function removePhoto(ref?: string | null): void {
  if (!ref) return;
  try {
    wx.getFileSystemManager().unlinkSync(ref);
  } catch {
    // 文件不存在则忽略
  }
}

/** 批量删除照片文件（编辑页「摘掉 N 张」用）。与 justThisOne 一致：先摘引用再删文件。 */
export function removePhotos(refs: Array<string | null | undefined>): void {
  for (const ref of refs) removePhoto(ref);
}
