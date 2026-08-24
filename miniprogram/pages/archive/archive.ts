/**
 * 抽屉页（已归档视图） [硬约束 #8]
 *
 * 归档必须可撤销，且必须有一个能看到已归档项的视图——
 * 误点一下就永久消失是不可接受的。
 * 视觉隐喻：抽屉里的旧明信片，微微泛黄，随时可以放回册子。
 */
import { Treasure } from '../../core/types';
import { repo } from '../../data/repo';
import { photoPath, removePhoto } from '../../photos/photoStore';
import { removeAudio } from '../../audio/audioStore';

interface CardVM {
  treasure: Treasure;
  photo: string;
}

Page({
  data: {
    items: [] as CardVM[],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const archived = repo.listTreasures('archived');
    this.setData({ items: archived.map(t => ({ treasure: t, photo: photoPath(t.photoRef) })) });
  },

  restore(e: WechatMiniprogram.TouchEvent) {
    repo.restore(e.currentTarget.dataset.id as string);
    wx.showToast({ title: '放回册子了', icon: 'none' });
    this.refresh();
  },

  /** 归档的条目也能改（不必先放回册子） */
  goEdit(e: WechatMiniprogram.TouchEvent) {
    wx.navigateTo({ url: `/pages/edit/edit?id=${e.currentTarget.dataset.id}` });
  },

  removeHard(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const t = repo.get(id);
    if (!t) return;
    wx.showModal({
      title: '彻底删除？',
      content: `「${t.name}」会永远消失。`,
      confirmText: '删除',
      confirmColor: '#b04a3a',
      success: m => {
        if (m.confirm) {
          removePhoto(t.photoRef);
          removeAudio(t.audioRef); // 修复泄漏：语音与照片同构，删条目必删文件
          repo.removeHard(id);
          this.refresh();
        }
      },
    });
  },
});
