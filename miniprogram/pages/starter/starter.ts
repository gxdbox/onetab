/**
 * 灵感卡起始包 [硬约束 #11]
 *
 * 空库是这个产品的头号杀手：新用户没东西可抽 = 没有第一次「就这个吧」。
 * 铁律：一律「点一下才采纳」，绝不自动灌进用户的库——
 * 同意的成本必须由用户亲手支付。
 * 采纳后以 wish + source:'starter' 入库（带来源标记，不冒充亲自验证）。
 */
import { STARTER_PACK } from '../../core/starterPack';
import { sceneOf } from '../../core/scenes';
import { repo } from '../../data/repo';

Page({
  data: {
    cards: STARTER_PACK.map(c => ({ ...c, emoji: sceneOf(c.sceneId).emoji })),
    adopted: [] as string[],
  },

  adopt(e: WechatMiniprogram.TouchEvent) {
    const i = Number(e.currentTarget.dataset.i);
    const card = STARTER_PACK[i];
    if (this.data.adopted.includes(card.name)) return;
    repo.create({ name: card.name, sceneId: card.sceneId, source: 'starter' });
    this.setData({ adopted: [...this.data.adopted, card.name] });
    wx.vibrateShort({ type: 'light' });
  },

  done() {
    wx.navigateBack();
  },
});
