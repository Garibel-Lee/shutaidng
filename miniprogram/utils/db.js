/**
 * 云数据库操作封装
 *
 * 集合设计：
 * - sessions: 计数会话记录
 *   {
 *     _openid, method, startTime, endTime, duration,
 *     taps: [timestamp], realCount, status, period
 *   }
 */

const db = wx.cloud.database();
const _ = db.command;

const COLLECTION = 'sessions';

/**
 * 创建新会话
 */
async function createSession(data) {
  const { method, period } = data;
  const now = Date.now();

  const res = await db.collection(COLLECTION).add({
    data: {
      method,
      period: period || null,
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
 * 获取当日会话列表
 */
async function getTodaySessions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const res = await db.collection(COLLECTION)
    .where({
      startTime: _.gte(todayStart).and(_.lt(todayEnd)),
    })
    .orderBy('startTime', 'desc')
    .get();

  return res.data;
}

/**
 * 获取指定日期范围的会话（用于统计）
 * @param {number} startDate - 开始时间戳
 * @param {number} endDate - 结束时间戳
 */
async function getSessionsByRange(startDate, endDate) {
  const res = await db.collection(COLLECTION)
    .where({
      startTime: _.gte(startDate).and(_.lt(endDate)),
      status: 'completed',
    })
    .orderBy('startTime', 'asc')
    .get();

  return res.data;
}

/**
 * 获取最近N天的每日胎动统计
 * @param {number} days - 天数
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
 * 获取活跃会话（未完成的）
 */
async function getActiveSession() {
  const res = await db.collection(COLLECTION)
    .where({ status: 'active' })
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
