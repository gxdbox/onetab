/**
 * 二选一 —— 零数据裁判 [硬约束 #12]
 *
 * 用户心里已有两三个选项，只想要个裁判。
 * 不依赖任何存量数据，是全新用户的最佳第一体验（空库杀手的第二防线）。
 * 裁决后可把赢家存进册子（以 wish 入库）——从裁判用户转化为收集者的天然通道。
 */
import { DEFAULT_SCENE, SCENES } from '../../core/scenes';
import { repo } from '../../data/repo';

Page({
  data: {
    options: ['', ''] as string[],
    flipping: false,
    result: '',
    scenes: SCENES,
    sceneId: DEFAULT_SCENE,
    saved: false,
  },

  onOption(e: WechatMiniprogram.Input) {
    const i = Number(e.currentTarget.dataset.i);
    const options = [...this.data.options];
    options[i] = e.detail.value;
    this.setData({ options });
  },

  addOption() {
    if (this.data.options.length >= 3) return;
    this.setData({ options: [...this.data.options, ''] });
  },

  removeOption() {
    if (this.data.options.length <= 2) return;
    this.setData({ options: this.data.options.slice(0, -1) });
  },

  judge() {
    const opts = this.data.options.map(s => s.trim()).filter(Boolean);
    if (opts.length < 2) {
      wx.showToast({ title: '至少要有两个选项', icon: 'none' });
      return;
    }
    this.setData({ flipping: true, result: '', saved: false });
    // 翻牌仪式：把选择权交出去需要一个动作门槛
    setTimeout(() => {
      const winner = opts[Math.floor(Math.random() * opts.length)];
      this.setData({ flipping: false, result: winner });
      wx.vibrateShort({ type: 'medium' });
    }, 1200);
  },

  again() {
    this.setData({ result: '', options: ['', ''] });
  },

  pickScene(e: WechatMiniprogram.TouchEvent) {
    this.setData({ sceneId: e.currentTarget.dataset.scene });
  },

  save() {
    if (!this.data.result) return;
    repo.create({ name: this.data.result, sceneId: this.data.sceneId });
    this.setData({ saved: true });
    wx.showToast({ title: '已收进册子（素描）', icon: 'none' });
    setTimeout(() => wx.navigateBack(), 900);
  },
});
