/**
 * 首页 —— 闭眼一指的地方
 *
 * [硬约束 #1]  重摇硬上限 2 次，用完后按钮消失，只剩「就它了」。
 * [硬约束 #2]  默认路径零配置：主流程只有长按抽签，筛选全关在抽屉里。
 * [硬约束 #4]  回访晋级闭环（留存引擎）：次日回访 → 确认开心 → 素描变烫金。
 * [硬约束 #5]  放宽只有真的换来新候选才告知（relaxedText 由引擎的 relaxed 渲染）。
 * [硬约束 #11] 空态：灵感卡 + 二选一双防线，绝不自动灌入。
 * [硬约束 #16] 记住的筛选条件以可见 chips 呈现，点击可清除。
 */
import { draw } from '../../core/engine';
import { sceneOf } from '../../core/scenes';
import { anniversaries } from '../../core/report';
import { DrawContext, RelaxLevel, SceneId, Treasure } from '../../core/types';
import { repo } from '../../data/repo';
import { photoPath } from '../../photos/photoStore';
import {
  RITUAL_DURATION_LABEL,
  RITUAL_DURATION_MS,
  RITUAL_SKIN_LABEL,
  getCustomScene,
  getRememberedFilters,
  getRitual,
  getSceneChips,
  removeCustomScene,
  setCustomScene,
  setRememberedFilters,
  setRitual,
  type RitualDuration,
  type RitualSkin,
} from '../../data/prefs';

interface ResultVM {
  treasure: Treasure;
  photo: string;
  emoji: string;
  relaxedText: string;
  relaxed: RelaxLevel[];
  rerollable: boolean;
}

const RELAX_TEXT: Record<RelaxLevel, string> = {
  scene: '已放宽：加入了其他场景的条目',
  notToday: '已放宽：加入了你说「今天不想」的条目',
};

/** 会话级状态（页面单例） */
let sessionExcluded: string[] = [];
let cycleTimer: ReturnType<typeof setInterval> | null = null;

Page({
  data: {
    scenes: [] as ReturnType<typeof getSceneChips>,
    customScene: null as ReturnType<typeof getCustomScene>,
    // 仪式偏好（V1.5）：时长 + 皮肤
    ritual: { duration: 'standard', skin: 'classic' } as { duration: RitualDuration; skin: RitualSkin },
    durationOptions: (['brisk', 'standard', 'grand'] as RitualDuration[]).map(key => ({
      key,
      label: RITUAL_DURATION_LABEL[key],
    })),
    skinOptions: (['classic', 'cinnabar'] as RitualSkin[]).map(key => ({
      key,
      label: RITUAL_SKIN_LABEL[key],
    })),
    isEmpty: true,
    verifiedCount: 0,
    wishCount: 0,
    archivedCount: 0,
    // 抽屉里的筛选，默认零配置 [硬约束 #2]
    mode: 'pool' as 'pool' | 'safe',
    filterScene: 'all' as SceneId | 'all',
    hasActiveFilters: false,
    sceneLabel: '',
    drawerOpen: false,
    // 回访晋级卡
    revisit: null as null | { treasure: Treasure; question: string },
    // 回忆时间线（V2）：一年前的今天
    memory: null as null | { kind: string; treasureName: string; yearsAgo: number; at: number; text: string },
    // 抽签
    drawing: false,
    cyclingName: '',
    result: null as ResultVM | null,
    rerollLeft: 2,
    emptyResult: '' as '' | 'empty' | 'safe-empty',
    // 晋级动画
    goldFlash: false,
  },

  onShow() {
    this.loadPrefs();
    this.refresh();
  },

  /** [硬约束 #16] 记住的筛选从偏好层恢复，并在主路径以 chips 呈现 */
  loadPrefs() {
    const filters = getRememberedFilters();
    const ritual = getRitual();
    const scenes = getSceneChips();
    const custom = getCustomScene();
    // 自定义场景已被删但筛选还指着它 → 回退到全部，避免隐形死筛选
    const sceneFilter =
      filters.sceneFilter === 'custom' && !custom ? 'all' : filters.sceneFilter;
    this.setData({
      scenes,
      customScene: custom,
      ritual,
      mode: filters.mode,
      filterScene: sceneFilter,
    });
  },

  onHide() {
    if (cycleTimer) {
      clearInterval(cycleTimer);
      cycleTimer = null;
    }
  },

  refresh() {
    const active = repo.listTreasures('active');
    const archived = repo.listTreasures('archived');
    const pending = repo.pendingRevisit();
    // 回忆时间线（V2）：一年前的今天。回访卡在场时回忆卡让位——当前的事优先于往事
    const memories = anniversaries(repo.listDraws(), repo.listTreasures(), repo.listPromotions(), Date.now());
    this.setData({
      isEmpty: active.length === 0,
      verifiedCount: active.filter(t => t.tier === 'verified').length,
      wishCount: active.filter(t => t.tier === 'wish').length,
      archivedCount: archived.length,
      hasActiveFilters: this.data.mode === 'safe' || this.data.filterScene !== 'all',
      sceneLabel: this.data.filterScene === 'all' ? '' : sceneOf(this.data.filterScene).label,
      revisit: pending
        ? { treasure: pending.treasure, question: `前两天抽中的「${pending.treasure.name}」，去了吗？开心吗？` }
        : null,
      memory: pending ? null : memories[0] || null,
    });
  },

  // ---------- 导航 ----------

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' });
  },
  goList() {
    wx.navigateTo({ url: '/pages/list/list' });
  },
  goArchive() {
    wx.navigateTo({ url: '/pages/archive/archive' });
  },
  goStarter() {
    wx.navigateTo({ url: '/pages/starter/starter' });
  },
  goDuel() {
    wx.navigateTo({ url: '/pages/duel/duel' });
  },

  // ---------- 抽屉（筛选关在这里） [硬约束 #2] ----------

  openDrawer() {
    this.setData({ drawerOpen: true });
  },
  closeDrawer() {
    this.setData({ drawerOpen: false });
  },
  setMode(e: WechatMiniprogram.TouchEvent) {
    const mode = e.currentTarget.dataset.mode as 'pool' | 'safe';
    this.setData({ mode, drawerOpen: false });
    setRememberedFilters({ mode, sceneFilter: this.data.filterScene });
    this.refresh(); // [硬约束 #16] 记住的条件立即以 chips 呈现
  },
  setScene(e: WechatMiniprogram.TouchEvent) {
    const scene = e.currentTarget.dataset.scene as SceneId | 'all';
    this.setData({ filterScene: scene, drawerOpen: false });
    setRememberedFilters({ mode: this.data.mode, sceneFilter: scene });
    this.refresh();
  },
  clearFilters() {
    this.setData({ mode: 'pool', filterScene: 'all' });
    setRememberedFilters({ mode: 'pool', sceneFilter: 'all' });
    this.refresh();
  },

  // ---------- 抽签 ----------

  hintLongpress() {
    wx.showToast({ title: '长按 1.5 秒，把选择权交出去', icon: 'none' });
  },

  onDraw() {
    if (this.data.isEmpty || this.data.drawing || this.data.result || this.data.emptyResult) return;
    sessionExcluded = [];
    this.setData({ rerollLeft: 2 }); // [硬约束 #1] 每次新抽签重置重摇配额
    this.beginDraw();
  },

  beginDraw() {
    const pool = repo.listTreasures('active');
    const ctx: DrawContext = {
      now: Date.now(),
      mode: this.data.mode,
      sceneFilter: this.data.filterScene,
      sessionExcluded,
      draws: repo.listDraws(),
    };
    const res = draw(pool, ctx, Math.random);

    this.setData({ drawing: true, result: null, emptyResult: '' });
    // 仪式：条目名老虎机式滚动（「闭眼一指」的数字化翻译）
    const names = pool.map(t => t.name);
    let i = 0;
    if (cycleTimer) clearInterval(cycleTimer);
    cycleTimer = setInterval(() => {
      this.setData({ cyclingName: names.length ? names[i++ % names.length] : '…' });
    }, 90);

    setTimeout(() => {
      if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
      }
      if (!res.treasure) {
        this.setData({ drawing: false, cyclingName: '', emptyResult: res.reason || 'empty' });
        return;
      }
      this.setData({
        drawing: false,
        cyclingName: '',
        result: {
          treasure: res.treasure,
          photo: photoPath(res.treasure.photoRef),
          emoji: sceneOf(res.treasure.sceneId).emoji,
          relaxedText: res.relaxed.map(l => RELAX_TEXT[l]).join('；'),
          relaxed: res.relaxed,
          rerollable: this.data.rerollLeft > 0,
        },
      });
      wx.vibrateShort({ type: 'medium' });
    }, RITUAL_DURATION_MS[this.data.ritual.duration]);
  },

  accept() {
    const r = this.data.result;
    if (!r) return;
    repo.recordDraw({
      treasureId: r.treasure.id,
      mode: this.data.mode,
      sceneFilter: this.data.filterScene,
      outcome: 'accepted',
      relaxed: r.relaxed,
    });
    this.setData({ result: null });
    wx.showToast({ title: '就它了 ✨', icon: 'none' });
    this.refresh();
  },

  /** [硬约束 #1] 重摇硬上限 2 次；被跳过的条目本次会话权重归零 */
  reroll() {
    const r = this.data.result;
    if (!r || this.data.rerollLeft <= 0) return;
    repo.recordDraw({
      treasureId: r.treasure.id,
      mode: this.data.mode,
      sceneFilter: this.data.filterScene,
      outcome: 'rerolled',
      relaxed: r.relaxed,
    });
    sessionExcluded.push(r.treasure.id);
    this.setData({ rerollLeft: this.data.rerollLeft - 1, result: null });
    this.beginDraw();
  },

  closeResult() {
    this.setData({ result: null, emptyResult: '' });
  },

  safeToPool() {
    this.setData({ mode: 'pool', emptyResult: '' });
    this.refresh();
  },

  // ---------- 仪式偏好（V1.5）：时长 / 皮肤 ----------

  setDuration(e: WechatMiniprogram.TouchEvent) {
    const duration = e.currentTarget.dataset.key as RitualDuration;
    const ritual = { ...this.data.ritual, duration };
    this.setData({ ritual });
    setRitual(ritual);
  },

  setSkin(e: WechatMiniprogram.TouchEvent) {
    const skin = e.currentTarget.dataset.key as RitualSkin;
    const ritual = { ...this.data.ritual, skin };
    this.setData({ ritual });
    setRitual(ritual);
  },

  // ---------- 自定义场景（最多一个） ----------

  addCustomScene() {
    wx.showModal({
      title: '自定义场景（最多一个）',
      editable: true,
      placeholderText: '比如：遛娃',
      success: res => {
        const label = (res.content || '').trim();
        if (!label) return;
        setCustomScene(label);
        this.loadPrefs();
        this.refresh();
        wx.showToast({ title: '已添加 ⭐', icon: 'none' });
      },
    });
  },

  removeCustomScene() {
    const custom = getCustomScene();
    if (!custom) return;
    const affected = repo.listTreasures().filter(t => t.sceneId === 'custom').length;
    wx.showModal({
      title: `删除「${custom.label}」？`,
      content: affected
        ? `该场景下有 ${affected} 个条目，删除后它们会移到「🎉 玩什么」。`
        : '这个场景下还没有条目。',
      confirmText: '删除',
      confirmColor: '#b04a3a',
      success: m => {
        if (!m.confirm) return;
        repo.reassignScene('custom', 'play');
        removeCustomScene();
        if (this.data.filterScene === 'custom') {
          this.setData({ filterScene: 'all' });
        }
        this.loadPrefs();
        this.refresh();
      },
    });
  },

  goBackup() {
    this.setData({ drawerOpen: false });
    wx.navigateTo({ url: '/pages/backup/backup' });
  },

  goReport() {
    this.setData({ drawerOpen: false });
    wx.navigateTo({ url: '/pages/report/report' });
  },

  // ---------- 回访晋级（留存引擎） [硬约束 #4] ----------

  revisitHappy() {
    const pending = repo.pendingRevisit();
    if (!pending) return;
    repo.promote(pending.draw.id, pending.treasure.id);
    this.setData({ revisit: null, goldFlash: true });
    wx.vibrateShort({ type: 'heavy' });
    setTimeout(() => this.setData({ goldFlash: false }), 2200);
    this.refresh();
  },

  revisitLater() {
    const pending = repo.pendingRevisit();
    if (pending) repo.markRevisitAsked(pending.draw);
    this.setData({ revisit: null });
  },

  revisitSad() {
    const pending = repo.pendingRevisit();
    if (!pending) return;
    repo.markRevisitAsked(pending.draw);
    repo.archive(pending.treasure.id); // 这条好像过时了 → 收进抽屉
    wx.showToast({ title: '已收进抽屉，它过时了', icon: 'none' });
    this.setData({ revisit: null });
    this.refresh();
  },
});
