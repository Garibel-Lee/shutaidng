const { METHODS, evaluateResult, formatDuration } = require('../../utils/fetal-movement');
const dbUtil = require('../../utils/db');

Page({
  data: {
    currentDate: null, // 当前查看日期的时间戳（当天0点）
    displayDate: '',
    sessions: [],
    daySummary: {
      totalCount: 0,
      sessionCount: 0,
    },
  },

  onLoad() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.setData({ currentDate: today.getTime() });
    this.updateDisplayDate();
  },

  onShow() {
    this.loadSessions();
  },

  // --- 日期导航 ---
  prevDay() {
    const prev = this.data.currentDate - 24 * 60 * 60 * 1000;
    this.setData({ currentDate: prev });
    this.updateDisplayDate();
    this.loadSessions();
  },

  nextDay() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = this.data.currentDate + 24 * 60 * 60 * 1000;
    if (next > today.getTime()) return; // 不能超过今天
    this.setData({ currentDate: next });
    this.updateDisplayDate();
    this.loadSessions();
  },

  updateDisplayDate() {
    const d = new Date(this.data.currentDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diff = today.getTime() - this.data.currentDate;
    let prefix = '';
    if (diff === 0) prefix = '今天 ';
    else if (diff === 24 * 60 * 60 * 1000) prefix = '昨天 ';

    const month = d.getMonth() + 1;
    const day = d.getDate();
    this.setData({
      displayDate: `${prefix}${month}月${day}日`,
    });
  },

  // --- 加载数据 ---
  async loadSessions() {
    const { currentDate } = this.data;
    const endDate = currentDate + 24 * 60 * 60 * 1000;

    try {
      const sessions = await dbUtil.getSessionsByRange(currentDate, endDate);

      // 格式化显示
      const formatted = sessions.map((s) => {
        const config = METHODS[s.method];
        const result = evaluateResult(s.method, s.realCount, s.duration);
        const startDate = new Date(s.startTime);
        const endDateObj = s.endTime ? new Date(s.endTime) : null;

        return {
          ...s,
          methodName: config ? config.name : s.method,
          timeRange: this.formatTimeRange(startDate, endDateObj),
          durationText: formatDuration(s.duration || 0),
          resultStatus: result.status,
          resultMessage: result.message,
        };
      });

      // 汇总
      let totalCount = 0;
      formatted.forEach((s) => {
        totalCount += s.realCount;
      });

      this.setData({
        sessions: formatted,
        daySummary: {
          totalCount,
          sessionCount: formatted.length,
        },
      });
    } catch (err) {
      console.error('加载记录失败:', err);
    }
  },

  formatTimeRange(start, end) {
    const pad = (n) => String(n).padStart(2, '0');
    const startStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    if (!end) return startStr;
    const endStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    return `${startStr} - ${endStr}`;
  },

  // --- 删除会话 ---
  async deleteSession(e) {
    const id = e.currentTarget.dataset.id;
    const res = await wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除这条记录吗？',
      confirmColor: '#FF6B81',
    });

    if (res.confirm) {
      try {
        await dbUtil.deleteSession(id);
        wx.showToast({ title: '已删除' });
        this.loadSessions();
      } catch (err) {
        console.error('删除失败:', err);
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    }
  },
});
