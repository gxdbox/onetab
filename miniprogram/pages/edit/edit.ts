/**
 * 编辑页 —— 闭环修复：写错了不该只能删了重记
 *
 * 可改：名字 / 场景 / joy 星级 / 备注 / 照片（换或删）/ 语音（重录或删）。
 * 不可改：tier（晋级只能走回访确认 [硬约束 #4]）、status（归档走抽屉 [硬约束 #8]）。
 * 媒体策略：新文件先暂存，点「保存」才写库并删旧文件；放弃则删新文件——不留孤儿。
 */
import { repo } from '../../data/repo';
import { getSceneChips, getCustomScene } from '../../data/prefs';
import { savePhoto, removePhoto } from '../../photos/photoStore';
import { VOICE_MAX_MS, saveAudio, removeAudio } from '../../audio/audioStore';
import { Treasure } from '../../core/types';
import { sceneOf } from '../../core/scenes';

// 录音器是全局单例（小程序限制）
const recorder = wx.getRecorderManager
  ? wx.getRecorderManager()
  : (null as WechatMiniprogram.RecorderManager | null);
let secsTimer: ReturnType<typeof setInterval> | null = null;

Page({
  data: {
    id: '',
    name: '',
    sceneId: 'eat' as Treasure['sceneId'],
    scenes: [] as ReturnType<typeof getSceneChips>,
    joy: 3,
    note: '',
    photo: '',
    recording: false,
    recordSecs: 0,
    audio: '',
    saved: false,
  },

  // 暂存的原始引用：保存时用来决定「删旧文件」；放弃时用来「删新文件」
  _origPhotoRef: null as string | null,
  _origAudioRef: null as string | null,

  onLoad(query: Record<string, string>) {
    if (recorder) {
      recorder.onStop(r => this.onRecordStop(r));
      recorder.onError(() => this.onRecordError());
    }
    const t = repo.get(query.id || '');
    if (!t) {
      wx.showToast({ title: '条目不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this._origPhotoRef = t.photoRef;
    this._origAudioRef = t.audioRef ?? null;
    this.setData({
      id: t.id,
      name: t.name,
      sceneId: t.sceneId,
      joy: t.joy,
      note: t.note || '',
      photo: t.photoRef || '',
      audio: t.audioRef || '',
    });
    this.refreshScenes();
  },

  /** 场景 chips：动态 + 兜底（条目在 custom 而自定义场景已删时，仍显示当前场景） */
  refreshScenes() {
    let scenes = getSceneChips();
    const hasCurrent = scenes.some(s => s.id === this.data.sceneId);
    if (!hasCurrent) {
      scenes = [...scenes, sceneOf(this.data.sceneId)];
    }
    this.setData({ scenes });
  },

  onName(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value });
  },
  onNote(e: WechatMiniprogram.TextareaInput) {
    this.setData({ note: e.detail.value });
  },
  pickScene(e: WechatMiniprogram.TouchEvent) {
    this.setData({ sceneId: e.currentTarget.dataset.scene });
  },
  pickJoy(e: WechatMiniprogram.TouchEvent) {
    this.setData({ joy: Number(e.currentTarget.dataset.v) });
  },

  // ---------- 照片：换 / 删 ----------

  async changePhoto() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
      });
      const temp = res.tempFiles[0].tempFilePath;
      const ref = await savePhoto(temp); // [硬约束 #15] 压缩 + 独立目录
      this.setData({ photo: ref }); // 旧文件等「保存」成功后再删
    } catch {
      // 用户取消
    }
  },

  removePhotoUI() {
    this.setData({ photo: '' });
  },

  // ---------- 语音：重录 / 删 ----------

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
    this.setData({ audio: ref });
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

  removeAudioUI() {
    this.setData({ audio: '' });
  },

  // ---------- 保存 / 放弃 ----------

  save() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '名字不能为空', icon: 'none' });
      return;
    }
    const newPhotoRef = this.data.photo || null;
    const newAudioRef = this.data.audio || null;
    repo.update(this.data.id, {
      name,
      sceneId: this.data.sceneId,
      joy: this.data.joy,
      note: this.data.note,
      photoRef: newPhotoRef,
      audioRef: newAudioRef,
    });
    // 保存成功后才删被替换下来的旧文件
    if (this._origPhotoRef && this._origPhotoRef !== newPhotoRef) removePhoto(this._origPhotoRef);
    if (this._origAudioRef && this._origAudioRef !== newAudioRef) removeAudio(this._origAudioRef);
    this.setData({ saved: true });
    wx.showToast({ title: '改好了', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 600);
  },

  onUnload() {
    if (secsTimer) {
      clearInterval(secsTimer);
      secsTimer = null;
    }
    if (this.data.recording) recorder?.stop();
    // 放弃编辑：清掉本次新产生、且没有入库的媒体文件，不留孤儿
    if (!this.data.saved) {
      if (this.data.photo && this.data.photo !== this._origPhotoRef) removePhoto(this.data.photo);
      if (this.data.audio && this.data.audio !== this._origAudioRef) removeAudio(this.data.audio);
    }
  },
});
