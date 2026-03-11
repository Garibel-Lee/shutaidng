const dbUtil = require('../../utils/db');

Page({
  data: {
    range: 7,
    overview: {
      totalCount: 0,
      avgPerSession: 0,
      maxAvgPerSession: 0,
      minAvgPerSession: 0,
      totalDays: 0,
    },
    chartData: [],
    dailyStats: [],
  },

  async onShow() {
    const app = getApp();
    await app.ensureLogin();
    await this.loadStats();
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

      // 有记录的天
      const activeDays = stats.filter((d) => d.totalCount > 0);

      // 胎动总次数
      const totalCount = activeDays.reduce((a, d) => a + d.totalCount, 0);

      // 总会话数（用于次均胎动）
      const totalSessions = activeDays.reduce((a, d) => a + d.sessions, 0);
      const avgPerSession = totalSessions > 0
        ? (totalCount / totalSessions).toFixed(1)
        : 0;

      // 每天的次均胎动
      const dailyAvgs = activeDays
        .filter((d) => d.sessions > 0)
        .map((d) => d.totalCount / d.sessions);

      const maxAvgPerSession = dailyAvgs.length > 0
        ? Math.round(Math.max(...dailyAvgs) * 10) / 10
        : 0;
      const minAvgPerSession = dailyAvgs.length > 0
        ? Math.round(Math.min(...dailyAvgs) * 10) / 10
        : 0;

      // 柱状图：柱子=总次数，圆点=当日次均
      const maxDayCount = activeDays.length > 0
        ? Math.max(...activeDays.map((d) => d.totalCount))
        : 0;
      const maxBarHeight = 240;

      // 计算每天的次均
      const dayAvgs = stats.map((d) =>
        d.sessions > 0 ? d.totalCount / d.sessions : 0
      );
      const maxDayAvg = dayAvgs.length > 0 ? Math.max(...dayAvgs) : 0;

      const chartData = stats.map((d, i) => {
        const barHeight = maxDayCount > 0
          ? Math.max(4, Math.round((d.totalCount / maxDayCount) * maxBarHeight))
          : 4;
        const dayAvg = dayAvgs[i];
        // 圆点高度：按次均的独立比例尺
        const dotBottom = maxDayAvg > 0
          ? Math.max(8, Math.round((dayAvg / maxDayAvg) * maxBarHeight))
          : 0;
        const dateParts = d.date.split('-');
        return {
          ...d,
          barHeight,
          dayAvg: dayAvg > 0 ? dayAvg.toFixed(1) : '',
          dotBottom: dayAvg > 0 ? dotBottom : 0,
          shortDate: `${parseInt(dateParts[1])}/${parseInt(dateParts[2])}`,
        };
      });

      // 明细（倒序）
      const dailyStats = [...stats].reverse().map((d) => ({
        ...d,
        barWidth: maxDayCount > 0 ? Math.round((d.totalCount / maxDayCount) * 100) : 0,
      }));

      this.setData({
        overview: {
          totalCount,
          totalSessions,
          avgPerSession,
          maxAvgPerSession,
          minAvgPerSession,
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
