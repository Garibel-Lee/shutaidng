App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }

    wx.cloud.init({
      env: 'cloud1-3ga27to9a782eb5a',
      traceUser: true,
    });

    // 静默登录，获取 openid
    this.login();
  },

  globalData: {
    openid: null,
    logged: false,
  },

  // 登录 Promise，供页面 await
  _loginPromise: null,

  login() {
    if (this._loginPromise) return this._loginPromise;

    this._loginPromise = wx.cloud.callFunction({ name: 'login' })
      .then((res) => {
        const openid = res.result.openid;
        this.globalData.openid = openid;
        this.globalData.logged = true;
        console.log('登录成功, openid:', openid);
        return openid;
      })
      .catch((err) => {
        console.error('登录失败:', err);
        this._loginPromise = null; // 失败后允许重试
        throw err;
      });

    return this._loginPromise;
  },

  /**
   * 确保已登录，供页面调用
   * @returns {Promise<string>} openid
   */
  async ensureLogin() {
    if (this.globalData.logged && this.globalData.openid) {
      return this.globalData.openid;
    }
    return this.login();
  },
});
