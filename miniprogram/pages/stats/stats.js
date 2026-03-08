const dbUtil = require('../../utils/db');

Page({
  data: {
    range: 7,
    overview: {
      avgCount: 0,
      maxCount: 0,
      minCount: 0,
      totalDays: 0,
    },
    chartData: [],
    dailyStats: [],
  },

  onLoad() {
    this.loadStats();
  },

  onShow() {
    this.loadStats();
  },

  switchRange(e) {
    const range = parseInt(e.currentTarget.dataset.range);
    this.setData({ range });
    this.loadStats();
  },

  async loadStats() {
    const { range } = this.data;

    try {
      const stats = await dbUtil.getDailyStats(range);

      // 计算概览
      const activeDays = stats.filter((d) => d.totalCount > 0);
      const counts = activeDays.map((d) => d.totalCount);
      const maxCount = counts.length > 0 ? Math.max(...counts) : 0;
      const minCount = counts.length > 0 ? Math.min(...counts) : 0;
      const avgCount = counts.length > 0
        ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
        : 0;

      // 柱状图数据
      const maxBarHeight = 240; // rpx
      const chartData = stats.map((d) => {
        const barHeight = maxCount > 0
          ? Math.max(4, Math.round((d.totalCount / maxCount) * maxBarHeight))
          : 4;
        const dateParts = d.date.split('-');
        return {
          ...d,
          barHeight,
          shortDate: `${parseInt(dateParts[1])}/${parseInt(dateParts[2])}`,
        };
      });

      // 明细（倒序显示）
      const dailyStats = [...stats].reverse().map((d) => ({
        ...d,
        barWidth: maxCount > 0 ? Math.round((d.totalCount / maxCount) * 100) : 0,
      }));

      this.setData({
        overview: {
          avgCount,
          maxCount,
          minCount,
          totalDays: activeDays.length,
        },
        chartData,
        dailyStats,
      });
    } catch (err) {
      console.error('加载统计失败:', err);
    }
  },
});
