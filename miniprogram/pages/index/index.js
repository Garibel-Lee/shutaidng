const { METHODS, calcRealCount, willIncreaseCount, evaluateResult, formatDuration, formatCountdown } = require('../../utils/fetal-movement');
const dbUtil = require('../../utils/db');

Page({
  data: {
    // 登录状态
    showLoginGate: false,
    nickname: '',
    showNicknameModal: false,
    nicknameInput: '',

    // 方法相关
    currentMethod: 'one_hour',
    methodDesc: '',

    // 计数状态
    isActive: false,
    sessionId: null,
    taps: [],
    tapCount: 0,
    realCount: 0,
    timerText: '00:00',

    // 按钮效果
    tapping: false,
    lastTapHint: '',
    lastTapIsNew: true,

    // 结果
    showResult: false,
    resultCount: 0,
    resultDuration: '',
    resultStatus: '',
    resultMessage: '',

    // 今日统计
    todayCount: 0,
    todaySessions: 0,
  },

  // 计时器相关
  _startTime: 0,
  _timer: null,
  _duration: 0,

  onLoad() {
    this.updateMethodDesc();
  },

  async onShow() {
    const app = getApp();
    await app.ensureLogin();
    // 等待昵称加载完成
    await app.loadNickname();

    if (app.globalData.nickname) {
      this.setData({ nickname: app.globalData.nickname, showLoginGate: false });
    } else {
      // 未设置昵称，强制显示登录引导
      this.setData({ showLoginGate: true, nickname: '' });
    }

    // 每次进入都刷新数据
    this.loadTodayStats();
    this.checkActiveSession();
  },

  onUnload() {
    this.clearTimer();
  },

  onHide() {
    // 不清除计时器，保持后台运行
  },

  // --- 首次登录设置昵称 ---
  onNicknameInput(e) {
    this.setData({ nicknameInput: e.detail.value });
  },

  onNicknameBlur(e) {
    if (e.detail.value) {
      this.setData({ nicknameInput: e.detail.value });
    }
  },

  async onConfirmNickname() {
    const nickname = this.data.nicknameInput.trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      await dbUtil.saveNickname(nickname);
      const app = getApp();
      app.globalData.nickname = nickname;
      this.setData({ nickname, showLoginGate: false, showNicknameModal: false });
      wx.hideLoading();
      wx.showToast({ title: '设置成功' });
    } catch (err) {
      wx.hideLoading();
      console.error('保存昵称失败:', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  // --- 修改昵称 ---
  onEditNickname() {
    this.setData({ showNicknameModal: true, nicknameInput: this.data.nickname });
  },

  onCancelNickname() {
    this.setData({ showNicknameModal: false });
  },

  async onUpdateNickname() {
    await this.onConfirmNickname();
  },

  // --- 方法切换 ---
  switchMethod(e) {
    if (this.data.isActive) {
      wx.showToast({ title: '请先结束当前计数', icon: 'none' });
      return;
    }
    const method = e.currentTarget.dataset.method;
    this.setData({ currentMethod: method, showResult: false });
    this.updateMethodDesc();
  },

  updateMethodDesc() {
    const config = METHODS[this.data.currentMethod];
    this.setData({ methodDesc: config ? config.description : '' });
  },

  // --- 核心：点击按钮 ---
  async onTapButton() {
    // 未登录拦截
    if (!this.data.nickname) {
      this.setData({ showLoginGate: true });
      return;
    }

    // 如果尚未开始，先启动会话
    if (!this.data.isActive) {
      await this.startSession();
      return;
    }

    // 记录点击
    const now = Date.now();
    const taps = [...this.data.taps, now];
    const realCount = calcRealCount(taps);
    const isNew = willIncreaseCount(this.data.taps, now);

    // 按钮动画
    this.setData({ tapping: true });
    setTimeout(() => this.setData({ tapping: false }), 300);

    // 更新界面
    this.setData({
      taps,
      tapCount: taps.length,
      realCount,
      lastTapHint: isNew ? '+1 新胎动!' : '同一次胎动（5分钟内）',
      lastTapIsNew: isNew,
    });

    // 云端同步（不阻塞UI）
    this.syncToCloud(now, realCount);

    // Cardiff法：达到目标自动结束
    if (this.data.currentMethod === 'cardiff' && realCount >= 10) {
      setTimeout(() => this.onEndSession(), 500);
    }
  },

  // --- 会话管理 ---
  async startSession() {
    wx.showLoading({ title: '准备中...' });

    try {
      const sessionId = await dbUtil.createSession({
        method: this.data.currentMethod,
      });

      this._startTime = Date.now();

      this.setData({
        isActive: true,
        sessionId,
        taps: [],
        tapCount: 0,
        realCount: 0,
        timerText: '00:00',
        showResult: false,
        lastTapHint: '',
      });

      this.startTimer();
      wx.hideLoading();

      // 启动后立即记录第一次点击
      this.onTapButton();
    } catch (err) {
      wx.hideLoading();
      console.error('创建会话失败:', err);
      wx.showToast({ title: '启动失败，请重试', icon: 'none' });
    }
  },

  async onEndSession() {
    if (!this.data.isActive) return;

    const duration = Date.now() - this._startTime;
    const { realCount, sessionId, currentMethod } = this.data;

    this.clearTimer();

    // 评估结果
    const result = evaluateResult(currentMethod, realCount, duration);

    this.setData({
      isActive: false,
      showResult: true,
      resultCount: realCount,
      resultDuration: formatDuration(duration),
      resultStatus: result.status,
      resultMessage: result.message,
    });

    // 同步结束状态到云端
    try {
      await dbUtil.endSession(sessionId, realCount, duration);
    } catch (err) {
      console.error('结束会话同步失败:', err);
    }

    // 刷新今日统计
    this.loadTodayStats();
  },

  // --- 云端同步 ---
  async syncToCloud(tapTime, realCount) {
    const { sessionId } = this.data;
    if (!sessionId) return;

    try {
      await dbUtil.addTap(sessionId, tapTime, realCount);
    } catch (err) {
      console.error('同步点击失败:', err);
    }
  },

  // --- 计时器 ---
  startTimer() {
    const { currentMethod } = this.data;
    const config = METHODS[currentMethod];
    const totalDuration = config.duration;

    this._timer = setInterval(() => {
      const elapsed = Date.now() - this._startTime;

      if (currentMethod === 'cardiff') {
        // Cardiff法：正计时
        this.setData({ timerText: formatDuration(elapsed) });
      } else {
        // 倒计时
        const remain = totalDuration - elapsed;
        if (remain <= 0) {
          this.setData({ timerText: '00:00' });
          this.onEndSession();
          return;
        }
        this.setData({ timerText: formatCountdown(remain) });
      }
    }, 1000);
  },

  clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  // --- 今日统计 ---
  async loadTodayStats() {
    try {
      const sessions = await dbUtil.getTodaySessions();
      const completed = sessions.filter((s) => s.status === 'completed');
      let totalCount = 0;
      completed.forEach((s) => {
        totalCount += s.realCount;
      });

      this.setData({
        todayCount: totalCount,
        todaySessions: completed.length,
      });
    } catch (err) {
      console.error('加载今日统计失败:', err);
    }
  },

  // --- 恢复活跃会话 ---
  async checkActiveSession() {
    try {
      const session = await dbUtil.getActiveSession();
      if (session) {
        this._startTime = session.startTime;
        this.setData({
          isActive: true,
          sessionId: session._id,
          currentMethod: session.method,
          taps: session.taps || [],
          tapCount: (session.taps || []).length,
          realCount: session.realCount || 0,
        });
        this.updateMethodDesc();
        this.startTimer();
      }
    } catch (err) {
      console.error('检查活跃会话失败:', err);
    }
  },
});
