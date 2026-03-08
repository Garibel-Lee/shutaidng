/**
 * 云数据库操作封装
 *
 * 集合设计：
 * - sessions: 计数会话记录
 *   { _openid, method, startTime, endTime, duration, taps, realCount, status }
 * - users: 用户信息
 *   { _openid, nickname, createTime, updateTime }
 *
 * 所有查询强制按 _openid 过滤，openid 未就绪时阻塞等待
 */

const db = wx.cloud.database();
const _ = db.command;

const COLLECTION = 'sessions';
const USER_COLLECTION = 'users';

/**
 * 获取当前用户 openid（强制等待登录完成）
 * 如果 openid 不存在，会调用 app.ensureLogin() 等待
 * @returns {Promise<string>} openid
 */
async function ensureOpenid() {
  const app = getApp();
  if (app.globalData.openid) {
    return app.globalData.openid;
  }
  // 等待登录完成
  const openid = await app.ensureLogin();
  if (!openid) {
    throw new Error('登录失败，无法获取用户标识');
  }
  return openid;
}

// --- 用户相关 ---

/**
 * 获取当前用户信息
 */
async function getUserInfo() {
  const openid = await ensureOpenid();
  const res = await db.collection(USER_COLLECTION)
    .where({ _openid: openid })
    .limit(1)
    .get();
  return res.data.length > 0 ? res.data[0] : null;
}

/**
 * 保存用户昵称
 */
async function saveNickname(nickname) {
  await ensureOpenid();
  const user = await getUserInfo();
  if (user) {
    return db.collection(USER_COLLECTION).doc(user._id).update({
      data: { nickname, updateTime: db.serverDate() },
    });
  }
  return db.collection(USER_COLLECTION).add({
    data: { nickname, createTime: db.serverDate(), updateTime: db.serverDate() },
  });
}

// --- 会话相关 ---

/**
 * 创建新会话
 */
async function createSession(data) {
  await ensureOpenid();
  const { method } = data;
  const now = Date.now();

  const res = await db.collection(COLLECTION).add({
    data: {
      method,
      startTime: now,
      endTime: null,
      duration: 0,
      taps: [],
      realCount: 0,
      status: 'active',
      createTime: db.serverDate(),
    },
  });

  return res._id;
}

/**
 * 添加一次点击记录
 */
async function addTap(sessionId, tapTime, realCount) {
  return db.collection(COLLECTION).doc(sessionId).update({
    data: {
      taps: _.push(tapTime),
      realCount,
    },
  });
}

/**
 * 结束会话
 */
async function endSession(sessionId, realCount, duration) {
  const now = Date.now();
  return db.collection(COLLECTION).doc(sessionId).update({
    data: {
      status: 'completed',
      endTime: now,
      duration,
      realCount,
    },
  });
}

/**
 * 获取当日会话列表（强制按当前用户）
 */
async function getTodaySessions() {
  const openid = await ensureOpenid();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const res = await db.collection(COLLECTION)
    .where({
      _openid: openid,
      startTime: _.gte(todayStart).and(_.lt(todayEnd)),
    })
    .orderBy('startTime', 'desc')
    .get();

  return res.data;
}

/**
 * 获取指定日期范围的会话（强制按当前用户）
 */
async function getSessionsByRange(startDate, endDate, completedOnly = true) {
  const openid = await ensureOpenid();
  const where = {
    _openid: openid,
    startTime: _.gte(startDate).and(_.lt(endDate)),
  };
  if (completedOnly) where.status = 'completed';

  const res = await db.collection(COLLECTION)
    .where(where)
    .orderBy('startTime', 'asc')
    .get();

  return res.data;
}

/**
 * 获取最近N天的每日胎动统计（强制按当前用户）
 */
async function getDailyStats(days) {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  const sessions = await getSessionsByRange(startDate.getTime(), endDate.getTime());

  // 按天分组统计
  const dailyMap = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = formatDateKey(d);
    dailyMap[key] = { date: key, totalCount: 0, sessions: 0 };
  }

  sessions.forEach((s) => {
    const key = formatDateKey(new Date(s.startTime));
    if (dailyMap[key]) {
      dailyMap[key].totalCount += s.realCount;
      dailyMap[key].sessions++;
    }
  });

  return Object.values(dailyMap);
}

/**
 * 获取活跃会话（强制按当前用户）
 */
async function getActiveSession() {
  const openid = await ensureOpenid();
  const res = await db.collection(COLLECTION)
    .where({
      _openid: openid,
      status: 'active',
    })
    .orderBy('startTime', 'desc')
    .limit(1)
    .get();

  return res.data.length > 0 ? res.data[0] : null;
}

/**
 * 删除会话
 */
async function deleteSession(sessionId) {
  return db.collection(COLLECTION).doc(sessionId).remove();
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  db,
  getUserInfo,
  saveNickname,
  createSession,
  addTap,
  endSession,
  getTodaySessions,
  getSessionsByRange,
  getDailyStats,
  getActiveSession,
  deleteSession,
  formatDateKey,
};
