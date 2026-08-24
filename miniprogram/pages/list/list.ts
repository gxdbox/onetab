/**
 * 列表页 —— 翻集邮册的地方
 *
 * [硬约束 #3]  点星改 joy（加权输入），只动主表不碰照片 [硬约束 #15]。
 * [硬约束 #7]  长按可标记「今天不想」（当日有效，次日自动失效）。
 * [硬约束 #8]  长按可归档（可撤销）；彻底删除需二次确认——误点一下就永久消失不可接受。
 */
import { SCENES, sceneOf } from '../../core/scenes';
import { startOfDay } from '../../core/engine';
import { Treasure } from '../../core/types';
import { repo } from '../../data/repo';
import { photoPath, removePhotos } from '../../photos/photoStore';
import { removeAudio } from '../../audio/audioStore';

interface CardVM {
  treasure: Treasure;
  photo: string;
}

Page({
  data: {
    groups: [] as { scene: (typeof SCENES)[number]; items: CardVM[] }[],
    total: 0,
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const all = repo.listTreasures('active');
    // 分组：预置四场景 + 自定义场景（若存在且有条目）
    const groups = SCENES.concat(
      all.some(t => t.sceneId === 'custom') ? [sceneOf('custom')] : []
    ).map(scene => ({
      scene,
      items: all
        .filter(t => t.sceneId === scene.id)
        .map(t => ({ treasure: t, photo: photoPath(t.photos?.[0]) })),
    })).filter(g => g.items.length > 0);
    this.setData({ groups, total: all.length });
  },

  onJoy(e: WechatMiniprogram.CustomEvent<{ value: number }> & WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const joy = e.detail.value;
    repo.setJoy(id, joy); // [硬约束 #15] 高频编辑绝不重写照片
    this.refresh();
  },

  onCardLong(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    const t = repo.get(id);
    if (!t) return;
    const notToday = t.notToday === startOfDay(Date.now());
    wx.showActionSheet({
      itemList: ['✏️ 修改', '🗄 收进抽屉', notToday ? '😊 恢复想' : '🙅 今天不想', '📝 写备注', '🗑 彻底删除'],
      success: r => {
        if (r.tapIndex === 0) {
          // 闭环：名字/场景/照片/语音写错了可以改，不必删了重记
          wx.navigateTo({ url: `/pages/edit/edit?id=${id}` });
        } else if (r.tapIndex === 1) {
          repo.archive(id); // [硬约束 #8] 可撤销，见抽屉页
          wx.showToast({ title: '收进抽屉了', icon: 'none' });
          this.refresh();
        } else if (r.tapIndex === 2) {
          repo.toggleNotToday(id); // [硬约束 #7]
          this.refresh();
        } else if (r.tapIndex === 3) {
          // 备注 ≤ 50 字：条目积累了情感，用户自发想补充细节的时机到了（V1.5）
          wx.showModal({
            title: `给「${t.name}」写备注`,
            editable: true,
            placeholderText: '加辣，不要香菜',
            content: t.note || '',
            success: m => {
              if (m.confirm) {
                repo.setNote(id, m.content || '');
                this.refresh();
              }
            },
          });
        } else if (r.tapIndex === 4) {
          wx.showModal({
            title: '彻底删除？',
            content: `「${t.name}」会永远消失，抽屉里也找不到了。`,
            confirmText: '删除',
            confirmColor: '#b04a3a',
            success: m => {
              if (m.confirm) {
                removePhotos(t.photos); // 先摘引用再删文件，绝不留孤儿 [硬约束 #15]
                removeAudio(t.audioRef); // 语音与照片同构：删条目必删文件
                repo.removeHard(id);
                this.refresh();
              }
            },
          });
        }
      },
    });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },
});
