/**
 * 备份与恢复（V1.5） [硬约束 #9 #15]
 *
 * 能导出就必须能导入。导入是合并语义（按 updatedAt 取新），不是覆盖——
 * 恢复备份不该反而弄丢现有的东西。
 * 导出 JSON 不含照片本体，只带 photoRef 引用（照片是设备本地文件）。
 */
import { repo } from '../../data/repo';
import { getCustomScene, setCustomScene } from '../../data/prefs';

Page({
  data: {
    importText: '',
    treasureCount: 0,
  },

  onShow() {
    this.setData({ treasureCount: repo.listTreasures().length });
  },

  // ---------- 导出 ----------

  /** 复制 JSON 到剪贴板：最通用的备份通道 */
  copyExport() {
    const json = JSON.stringify(repo.exportData());
    wx.setClipboardData({
      data: json,
      success: () => {
        wx.showToast({ title: '已复制，粘贴到备忘录保存', icon: 'none', duration: 2500 });
      },
    });
  },

  /** 存成文件并分享（仅手机端可用） */
  shareExport() {
    const json = JSON.stringify(repo.exportData());
    const path = `${wx.env.USER_DATA_PATH}/onetab-backup.json`;
    try {
      wx.getFileSystemManager().writeFileSync(path, json, 'utf8');
      wx.shareFileMessage({
        filePath: path,
        fileName: `册子备份-${new Date().toISOString().slice(0, 10)}.json`,
        fail: () => {
          // 分享面板取消 / 模拟器不支持 → 兜底走剪贴板
          this.copyExport();
        },
      });
    } catch {
      this.copyExport();
    }
  },

  // ---------- 导入 ----------

  onImportInput(e: WechatMiniprogram.TextareaInput) {
    this.setData({ importText: e.detail.value });
  },

  doImport() {
    const text = this.data.importText.trim();
    if (!text) {
      wx.showToast({ title: '先把备份 JSON 粘贴进来', icon: 'none' });
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      wx.showToast({ title: '这不是有效的 JSON', icon: 'none' });
      return;
    }
    const report = repo.importData(payload); // 合并语义 [硬约束 #9]
    // 导入数据里的自定义场景：本地没有才采纳（本地的优先）
    const raw = payload as Record<string, unknown>;
    if (raw && raw.customScene && !getCustomScene()) {
      const label = (raw.customScene as { label?: unknown }).label;
      if (typeof label === 'string' && label.trim()) setCustomScene(label);
    }
    wx.showModal({
      title: '恢复完成',
      content: `新增 ${report.added} 条，更新 ${report.updated} 条，保留本地较新 ${report.kept} 条。\n现有条目一个都没丢。`,
      showCancel: false,
      success: () => {
        this.setData({ importText: '' });
        this.onShow();
      },
    });
  },
});
