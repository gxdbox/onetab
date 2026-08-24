/**
 * 添加页 —— P2「十秒记录」的现场检验
 *
 * [硬约束 #2]  唯一必填项是名字；场景有默认值，用户可以完全不碰。
 * [硬约束 #4]  新条目一律以 wish 入库——不需要用户选状态，零配置。
 * [硬约束 #15] 照片压缩后存独立文件目录，主表只存 photoRef。
 */
import { DEFAULT_SCENE } from '../../core/scenes';
import { repo } from '../../data/repo';
import { savePhoto, removePhoto } from '../../photos/photoStore';
import { getSceneChips } from '../../data/prefs';
import { VOICE_MAX_MS, saveAudio, removeAudio } from '../../audio/audioStore';

// 录音器是全局单例（小程序限制）；页面只持引用
const recorder = wx.getRecorderManager
  ? wx.getRecorderManager()
  : (null as WechatMiniprogram.RecorderManager | null);

// 录音秒数计时器（模块级，避开 Page 自定义属性的类型限制）
let secsTimer: ReturnType<typeof setInterval> | null = null;

Page({
  data: {
    name: '',
    sceneId: DEFAULT_SCENE,
    scenes: [] as ReturnType<typeof getSceneChips>,
    photo: '',
    photoRef: null as string | null,
    // 语音速记（V2）：≤ 15s，说一句而不是录一段
    recording: false,
    recordSecs: 0,
    audioRef: null as string | null,
    audio: '',
    saved: false,
    savedName: '',
  },

  onShow() {
    // 场景 chips 动态读取：自定义场景可能刚被创建/删除
    this.setData({ scenes: getSceneChips() });
  },

  onName(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value });
  },

  pickScene(e: WechatMiniprogram.TouchEvent) {
    this.setData({ sceneId: e.currentTarget.dataset.scene });
  },

  async choosePhoto() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
      });
      const temp = res.tempFiles[0].tempFilePath;
      const ref = await savePhoto(temp); // [硬约束 #15] 压缩 + 独立存储
      // 连拍两张时，第一张还没入库就直接清掉，不留孤儿
      if (this.data.photoRef && this.data.photoRef !== ref) removePhoto(this.data.photoRef);
      this.setData({ photo: ref, photoRef: ref });
    } catch {
      // 用户取消选择
    }
  },

  // ---------- 语音速记（V2） ----------

  toggleRecord() {
    if (this.data.recording) {
      recorder?.stop();
      return;
    }
    if (!recorder) {
      wx.showToast({ title: '当前环境不支持录音', icon: 'none' });
      return;
    }
    this.setData({ recording: true, recordSecs: 0 });
    secsTimer = setInterval(() => {
      this.setData({ recordSecs: Math.min(15, this.data.recordSecs + 1) });
    }, 1000);
    recorder.start({ duration: VOICE_MAX_MS, format: 'aac' });
  },

  onRecordStop(res: { tempFilePath?: string }) {
    if (secsTimer) {
      clearInterval(secsTimer);
      secsTimer = null;
    }
    this.setData({ recording: false });
    if (!res.tempFilePath) return;
    const ref = saveAudio(res.tempFilePath);
    this.setData({ audioRef: ref, audio: ref });
  },

  onRecordError() {
    if (secsTimer) {
      clearInterval(secsTimer);
      secsTimer = null;
    }
    this.setData({ recording: false });
    wx.showToast({ title: '没录上，再试一次？', icon: 'none' });
  },

  playAudio() {
    if (!this.data.audio) return;
    const player = wx.createInnerAudioContext();
    player.src = this.data.audio;
    player.play();
    player.onEnded(() => player.destroy());
  },

  discardAudio() {
    this.setData({ audioRef: null, audio: '' });
  },

  onLoad() {
    if (recorder) {
      recorder.onStop(r => this.onRecordStop(r));
      recorder.onError(() => this.onRecordError());
    }
  },

  onUnload() {
    if (secsTimer) {
      clearInterval(secsTimer);
      secsTimer = null;
    }
    if (this.data.recording) recorder?.stop();
    // 闭环：录了音/拍了照但放弃保存 → 清掉未入库的媒体文件，不留孤儿
    if (!this.data.saved) {
      if (this.data.photoRef) removePhoto(this.data.photoRef);
      if (this.data.audioRef) removeAudio(this.data.audioRef);
    }
  },

  submit() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '给这个快乐起个名字吧', icon: 'none' });
      return;
    }
    repo.create({ name, sceneId: this.data.sceneId, photoRef: this.data.photoRef, audioRef: this.data.audioRef });
    wx.vibrateShort({ type: 'light' });
    // 收进册子后停留 1.5 秒——「快乐被强化一次」的具象化（SPEC §6.1）
    this.setData({ saved: true, savedName: name });
    setTimeout(() => wx.navigateBack(), 1500);
  },
});
