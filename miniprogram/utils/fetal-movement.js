/**
 * 胎动计算核心逻辑
 *
 * 5分钟规则：
 * - 第一次感受到胎动，算1次
 * - 之后每次感受到胎动，若距离上一次点击 >= 5分钟，算新的1次
 * - 若距离上一次点击 < 5分钟，不增加计数（属于同一次胎动）
 */

const INTERVAL_MS = 5 * 60 * 1000; // 5分钟（毫秒）

/**
 * 根据原始点击时间戳数组，计算真实胎动次数
 * @param {number[]} taps - 点击时间戳数组（毫秒），需已排序
 * @returns {number} 真实胎动次数
 */
function calcRealCount(taps) {
  if (!taps || taps.length === 0) return 0;

  let count = 1; // 第一次点击算1次
  let lastCountedTime = taps[0];

  for (let i = 1; i < taps.length; i++) {
    if (taps[i] - lastCountedTime >= INTERVAL_MS) {
      count++;
      lastCountedTime = taps[i];
    }
  }

  return count;
}

/**
 * 判断新的一次点击是否会增加真实胎动计数
 * @param {number[]} taps - 已有的点击时间戳数组
 * @param {number} newTap - 新点击的时间戳
 * @returns {boolean}
 */
function willIncreaseCount(taps, newTap) {
  if (!taps || taps.length === 0) return true;

  // 找到最后一个"被计数"的时间点
  let lastCountedTime = taps[0];
  for (let i = 1; i < taps.length; i++) {
    if (taps[i] - lastCountedTime >= INTERVAL_MS) {
      lastCountedTime = taps[i];
    }
  }

  return newTap - lastCountedTime >= INTERVAL_MS;
}

/**
 * 计数方法配置
 */
const METHODS = {
  one_hour: {
    name: '1小时法',
    duration: 60 * 60 * 1000,
    description: '选一个固定时段数1小时，正常>=3次',
    normalThreshold: 3,
  },
  three_times: {
    name: '三次法',
    duration: 60 * 60 * 1000, // 每次1小时
    description: '早中晚各数1小时，3次之和x4=12小时估值，正常>=30次',
    normalThreshold: 10, // 单次>=10次为正常（3次之和>=30）
    periods: ['morning', 'afternoon', 'evening'],
  },
  cardiff: {
    name: 'Cardiff法',
    duration: 2 * 60 * 60 * 1000, // 最长2小时
    targetCount: 10,
    description: '从固定时间开始数到10次，正常应在2小时内完成',
  },
};

/**
 * 评估胎动结果
 * @param {string} method - 计数方法
 * @param {number} realCount - 真实胎动次数
 * @param {number} duration - 实际用时（毫秒）
 * @returns {{ status: string, message: string }}
 */
function evaluateResult(method, realCount, duration) {
  const config = METHODS[method];
  if (!config) return { status: 'unknown', message: '未知方法' };

  if (method === 'one_hour') {
    if (realCount >= 3) {
      return { status: 'normal', message: '胎动正常' };
    }
    return { status: 'warning', message: '胎动偏少，建议关注' };
  }

  if (method === 'cardiff') {
    const twoHours = 2 * 60 * 60 * 1000;
    if (realCount >= 10 && duration <= twoHours) {
      return { status: 'normal', message: '胎动正常' };
    }
    if (realCount >= 10) {
      return { status: 'warning', message: '达到10次但用时较长，建议关注' };
    }
    return { status: 'warning', message: '未达到10次，建议咨询医生' };
  }

  if (method === 'three_times') {
    if (realCount >= 10) {
      return { status: 'normal', message: '本次胎动正常' };
    }
    if (realCount >= 5) {
      return { status: 'warning', message: '胎动偏少，建议关注' };
    }
    return { status: 'danger', message: '胎动过少，建议尽快咨询医生' };
  }

  return { status: 'unknown', message: '' };
}

/**
 * 格式化时长显示
 * @param {number} ms - 毫秒数
 * @returns {string}
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 格式化倒计时显示
 * @param {number} remainMs - 剩余毫秒数
 * @returns {string}
 */
function formatCountdown(remainMs) {
  if (remainMs <= 0) return '00:00';
  return formatDuration(remainMs);
}

module.exports = {
  INTERVAL_MS,
  METHODS,
  calcRealCount,
  willIncreaseCount,
  evaluateResult,
  formatDuration,
  formatCountdown,
};
