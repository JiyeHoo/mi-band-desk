import { holidayFor } from './holidays'
export function pad2(value) {
  return value < 10 ? '0' + value : '' + value
}

export function clockText(date) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return {
    time: pad2(date.getHours()) + ':' + pad2(date.getMinutes()),
    seconds: pad2(date.getSeconds()),
    date: (date.getMonth() + 1) + '月' + date.getDate() + '日  周' + weekdays[date.getDay()]
  }
}

export function durationText(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return pad2(Math.floor(seconds / 3600)) + ':' + pad2(Math.floor(seconds / 60) % 60) + ':' + pad2(seconds % 60)
}

export function pixelOffset(milliseconds) {
  const positions = [[0, 0], [2, 0], [2, 2], [0, 2], [-2, 2], [-2, 0], [-2, -2], [0, -2]]
  return positions[Math.floor(Math.max(0, milliseconds) / 60000) % positions.length]
}

// Local calendar arithmetic (not fixed milliseconds) handles month/year and DST boundaries.
export function weekText(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    days.push({ ...holidayFor(d), label: '一二三四五六日'[i], date: '' + d.getDate(), today: d.toDateString() === date.toDateString() })
  }
  return { range: (start.getMonth() + 1) + '月' + start.getDate() + '日 — ' + (end.getMonth() + 1) + '月' + end.getDate() + '日',
    today: '今天 ' + (date.getMonth() + 1) + '月' + date.getDate() + '日', days }
}
