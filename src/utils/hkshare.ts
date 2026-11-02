export function formatHKShareTime(
  value: string | number | null | undefined,
  daily = false,
): string {
  if (value == null) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(daily ? {} : { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
  }).format(date);
}

export function hkSharePollingDelay(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Hong_Kong',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  const weekday = part('weekday');
  // Clock schedule only: no holiday calendar or claim of a real-time feed.
  const inSession =
    weekday !== 'Sat' &&
    weekday !== 'Sun' &&
    ((minutes >= 570 && minutes < 720) || (minutes >= 780 && minutes < 960));
  return inSession ? 5000 : 60000;
}
