/**
 * 添加页 —— P2「十秒记录」的现场检验
 *
 * [硬约束 #2]  唯一必填项是名字；场景有默认值，用户可以完全不碰。
 * [硬约束 #4]  新条目一律以 wish 入库——不需要用户选状态，零配置。
 * [硬约束 #15] 照片压缩后存独立文件目录，主表只存 photos 引用（文件路径数组）。
 */
import { DEFAULT_SCENE } from '../../core/scenes';
import { guessSceneId } from '../../core/category';
import { MAX_PHOTOS } from '../../core/merge';
import { repo } from '../../data/repo';
import { savePhoto, removePhoto, removePhotos } from '../../photos/photoStore';
import { getSceneChips, addCustomScene, CUSTOM_SCENE_EMOJIS } from '../../data/prefs';
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
    photos: [] as string[],
    // 场景是自动猜的（显示「·猜的」，手动点 chip 后不再被覆盖）
    sceneGuessed: false,
    // 批量模式：多行粘贴，一次收好 N 个
    batch: false,
    bulk: '',
    savedCount: 0,
    // 新增场景（需求 1）：场景不够时当场建一个
    addingScene: false,
    newSceneLabel: '',
    newSceneEmoji: '⭐',
    emojiOptions: CUSTOM_SCENE_EMOJIS,
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
    const name = e.detail.value;
    // 场景自动猜：默认路径零配置，猜错只需点一下改（justThisOne 交互哲学）
    const picked = name.trim() ? guessSceneId(name) : DEFAULT_SCENE;
    this.setData({ name, sceneId: picked, sceneGuessed: true });
  },

  pickScene(e: WechatMiniprogram.TouchEvent) {
    // 用户手动选了场景后，不再被自动猜覆盖
    this.setData({ sceneId: e.currentTarget.dataset.scene, sceneGuessed: false });
  },

  // ---------- 新增场景（需求 1）：场景不够时当场建一个，不用绕回首页抽屉 ----------

  startAddScene() {
    this.setData({ addingScene: true, newSceneLabel: '', newSceneEmoji: '⭐' });
  },

  cancelAddScene() {
    this.setData({ addingScene: false });
  },

  onNewSceneLabel(e: WechatMiniprogram.Input) {
    this.setData({ newSceneLabel: e.detail.value });
  },

  pickNewEmoji(e: WechatMiniprogram.TouchEvent) {
    this.setData({ newSceneEmoji: e.currentTarget.dataset.emoji });
  },

  confirmAddScene() {
    const label = this.data.newSceneLabel.trim();
    if (!label) {
      wx.showToast({ title: '给场景起个名字（≤4 字）', icon: 'none' });
      return;
    }
    const scene = addCustomScene(label, this.data.newSceneEmoji);
    if (!scene) {
      wx.showToast({ title: '这个场景已经有了', icon: 'none' });
      return;
    }
    // 创建后自动选中新场景，chips 重读；随后「收进册子」直接落到新场景
    this.setData({
      addingScene: false,
      newSceneLabel: '',
      sceneId: scene.id,
      sceneGuessed: false,
      scenes: getSceneChips(),
    });
    wx.vibrateShort({ type: 'light' });
    wx.showToast({ title: `已建场景 ${scene.emoji}`, icon: 'none' });
  },

  // ---------- 照片（≤3 张） [硬约束 #15] ----------

  async addPhoto() {
    const remaining = MAX_PHOTOS - this.data.photos.length;
    if (remaining <= 0) return;
    try {
      const res = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sizeType: ['compressed'],
      });
      // 逐张顺序保存，防一次并发写太多内存打爆；追加后截断到 ≤3
      let photos = [...this.data.photos];
      for (const f of res.tempFiles) {
        const ref = await savePhoto(f.tempFilePath); // [硬约束 #15] 压缩 + 独立存储
        photos.push(ref);
        if (photos.length >= MAX_PHOTOS) break;
      }
      this.setData({ photos: photos.slice(0, MAX_PHOTOS) });
    } catch {
      // 用户取消选择
    }
  },

  removePhotoAt(e: WechatMiniprogram.TouchEvent) {
    const i = Number(e.currentTarget.dataset.i);
    const photos = [...this.data.photos];
    const [ref] = photos.splice(i, 1);
    // 先摘引用再删文件，绝不留孤儿
    if (ref) removePhoto(ref);
    this.setData({ photos });
  },

  // ---------- 批量模式（多行粘贴） ----------

  toggleBatch() {
    this.setData({ batch: !this.data.batch });
  },

  onBulk(e: WechatMiniprogram.TextareaInput) {
    this.setData({ bulk: e.detail.value });
  },

  submitBulk() {
    const lines = this.data.bulk
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      wx.showToast({ title: '一行一个，写点什么吧', icon: 'none' });
      return;
    }
    for (const line of lines) {
      // 批量收：不猜场景，一律默认场景，收完再改
      repo.create({ name: line, sceneId: DEFAULT_SCENE });
    }
    wx.vibrateShort({ type: 'light' });
    this.setData({ saved: true, savedCount: lines.length, savedName: '' });
    setTimeout(() => wx.navigateBack(), 1500);
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
      removePhotos(this.data.photos);
      if (this.data.audioRef) removeAudio(this.data.audioRef);
    }
  },

  submit() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '给这个快乐起个名字吧', icon: 'none' });
      return;
    }
    repo.create({ name, sceneId: this.data.sceneId, photos: this.data.photos, audioRef: this.data.audioRef });
    wx.vibrateShort({ type: 'light' });
    // 收进册子后停留 1.5 秒——「快乐被强化一次」的具象化（SPEC §6.1）
    this.setData({ saved: true, savedName: name, savedCount: 0 });
    setTimeout(() => wx.navigateBack(), 1500);
  },
});
