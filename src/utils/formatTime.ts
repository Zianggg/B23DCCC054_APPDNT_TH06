const pad = (n: number) => String(n).padStart(2, '0');

const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const ddmm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export function formatMessageTime(ts?: number): string {
  return ts ? hhmm(new Date(ts)) : '';
}

export function formatListTime(ts: number | undefined, now: number = Date.now()): string {
  if (!ts) {
    return '';
  }
  const d = new Date(ts);
  return isSameDay(d, new Date(now)) ? hhmm(d) : ddmm(d);
}

// "Hoạt động X phút trước" khi người kia offline
export function formatLastSeen(ts: number | undefined, now: number = Date.now()): string {
  if (!ts) {
    return '';
  }
  const minutes = Math.floor(Math.max(0, now - ts) / 60000);
  if (minutes < 1) {
    return 'Vừa mới hoạt động';
  }
  if (minutes < 60) {
    return `Hoạt động ${minutes} phút trước`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Hoạt động ${hours} giờ trước`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `Hoạt động ${days} ngày trước`;
  }
  return `Hoạt động ngày ${ddmm(new Date(ts))}`;
}

// Thời gian tương đối cho danh sách thông báo
export function formatAgo(ts: number | undefined, now: number = Date.now()): string {
  if (!ts) {
    return '';
  }
  const minutes = Math.floor(Math.max(0, now - ts) / 60000);
  if (minutes < 1) {
    return 'Vừa xong';
  }
  if (minutes < 60) {
    return `${minutes} phút trước`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} giờ trước`;
  }
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} ngày trước` : ddmm(new Date(ts));
}
