/**
 * 年度快乐报告（V2）—— 一年一次的静态纪念页
 *
 * 规格 §5.3：**不做月报/周报**——低频才配得上「年报」的仪式感。
 * 页面本身就是要被截图保存的纪念品；没有分享按钮、没有增长指标，
 * 幸福一旦被量化成曲线就会去追逐指标（拒绝清单明令禁止仪表盘）。
 */
import { annualReport, type AnnualReport } from '../../core/report';
import { repo } from '../../data/repo';

Page({
  data: {
    report: null as AnnualReport | null,
    year: 0,
  },

  onLoad() {
    const year = new Date().getFullYear();
    const report = annualReport(repo.listTreasures(), repo.listDraws(), repo.listPromotions(), year);
    this.setData({ report, year });
  },
});
