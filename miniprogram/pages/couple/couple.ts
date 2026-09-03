/**
 * 情侣共册（需求 2-B）—— 两个人共享同一本册子（云同步共享快照）
 *
 * 「平常注意收集彼此之间的小确幸，拿不定主意时随机来一个」——
 * 共册 = 两个 openid 读写同一个快照文档；拉取走 updatedAt 合并语义 [硬约束 #9]。
 * 云同步未配置（SYNC_ENV_ID 为空）时整页只展示开启指引，不出现操作。
 */
import {
  CoupleRoom,
  coupleEnabled,
  createRoom,
  errText,
  joinRoom,
  leaveRoom,
  refreshRoom,
} from '../../sync/couple';
import { sync } from '../../sync';

Page({
  data: {
    enabled: false,
    loading: true,
    room: null as CoupleRoom | null,
    joinCode: '',
    busy: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    if (!coupleEnabled()) {
      this.setData({ enabled: false, loading: false });
      return;
    }
    this.setData({ enabled: true, loading: true });
    const room = await refreshRoom();
    this.setData({ room, loading: false });
  },

  onJoinCode(e: WechatMiniprogram.Input) {
    this.setData({ joinCode: e.detail.value });
  },

  /** 创建共册：生成口令 → 先拉（拿到另一半已有的？不，新建时还没人）→ 推自己的全量上去 */
  async doCreate() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    const r = await createRoom();
    this.setData({ busy: false });
    if (!r.ok || !r.room) {
      wx.showToast({ title: r.error || '创建失败', icon: 'none' });
      return;
    }
    // 把本机已有的小确幸全量推上共册快照，让 TA 第一次打开就能看到
    await this.syncNow();
    this.setData({ room: r.room });
    wx.showToast({ title: '共册建好了 💑', icon: 'none' });
  },

  /** 加入共册：输口令 → 先拉（合并另一半已有的）→ 推合并后的全量，两边都齐 */
  async doJoin() {
    const code = this.data.joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      wx.showToast({ title: '口令是 6 位字母数字', icon: 'none' });
      return;
    }
    if (this.data.busy) return;
    this.setData({ busy: true });
    const r = await joinRoom(code);
    this.setData({ busy: false });
    if (!r.ok || !r.room) {
      wx.showToast({ title: r.error || '加入失败', icon: 'none' });
      return;
    }
    // 加入瞬间就完成一次双向合并：拉 TA 的 → 推合并后的全集
    await this.syncNow();
    this.setData({ room: r.room });
    wx.showToast({ title: '进共册啦 💑', icon: 'none' });
  },

  /** 先拉（合并另一半的），再推（上传合并后的全集）——一次「对齐」 */
  async syncNow() {
    try {
      await sync.pull();
    } catch {
      /* 静默 */
    }
    try {
      await sync.push();
    } catch {
      /* 静默 */
    }
  },

  doLeave() {
    wx.showModal({
      title: '退出共册？',
      content: '退出后你们不再共享册子；你手机上的数据会完整保留，不会删除。',
      confirmText: '退出',
      confirmColor: '#b04a3a',
      success: async m => {
        if (!m.confirm) return;
        await leaveRoom();
        this.setData({ room: null, joinCode: '' });
        wx.showToast({ title: '已退出共册', icon: 'none' });
      },
    });
  },

  copyCode() {
    const code = this.data.room?.code;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '口令已复制，发给 TA', icon: 'none' }),
    });
  },
});
