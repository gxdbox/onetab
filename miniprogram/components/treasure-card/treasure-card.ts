/**
 * treasure-card —— 册子里的一张卡
 *
 * [硬约束 #10] 双视觉是「收集」的回报本身：
 *   verified（安全牌）= 烫金收藏品；wish（心愿）= 铅笔素描。
 * [硬约束 #3]  星级是 joy（加权抽签的输入），不是排行榜。
 */
import { SCENES } from '../../core/scenes';
import { startOfDay } from '../../core/engine';
import { Treasure } from '../../core/types';

// 共享播放器：同一时刻只播一段语音
let player: WechatMiniprogram.InnerAudioContext | null = null;

Component({
  properties: {
    treasure: { type: Object, value: {} },
    photo: { type: String, value: '' },
    archived: { type: Boolean, value: false },
  },
  data: {
    emoji: '🍜',
    isNotToday: false,
    photoOk: true, // 照片文件可能已被清理（如导入的引用），失败时回退到场景 emoji
    audioPlaying: false,
  },
  observers: {
    treasure(t: Treasure) {
      if (!t || !t.id) return;
      const scene = SCENES.find(s => s.id === t.sceneId);
      this.setData({
        emoji: scene ? scene.emoji : '🍜',
        isNotToday: t.notToday != null && t.notToday === startOfDay(Date.now()),
      });
    },
    photo() {
      this.setData({ photoOk: true });
    },
  },
  lifetimes: {
    detached() {
      if (this.data.audioPlaying) player?.stop();
    },
  },
  methods: {
    onJoy(e: WechatMiniprogram.TouchEvent) {
      this.triggerEvent('joy', { value: Number(e.currentTarget.dataset.v) });
    },
    onLong() {
      this.triggerEvent('cardlong');
    },
    onImgError() {
      this.setData({ photoOk: false });
    },
    /** 语音速记（V2）：点一下听一句当初为什么收它 */
    onAudio() {
      const ref = this.data.treasure.audioRef;
      if (!ref) return;
      if (this.data.audioPlaying) {
        player?.stop();
        return;
      }
      player?.stop();
      player = wx.createInnerAudioContext();
      player.src = ref;
      this.setData({ audioPlaying: true });
      player.onEnded(() => this.setData({ audioPlaying: false }));
      player.onError(() => {
        // 音频文件已被清理（换设备导入等）——静默降级，不打断浏览
        this.setData({ audioPlaying: false });
      });
      player.play();
    },
  },
});
