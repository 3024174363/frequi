export function formatAShareTime(value: string | number | null | undefined, daily = false): string {
  if (value == null) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(daily ? {} : { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
  }).format(date);
}

export function aSharePollingDelay(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value;
  const minutes = Number(part('hour')) * 60 + Number(part('minute'));
  const weekday = part('weekday');
  // A schedule, not a holiday calendar. Outside continuous sessions, poll slowly.
  const inSession =
    weekday !== 'Sat' &&
    weekday !== 'Sun' &&
    ((minutes >= 570 && minutes < 690) || (minutes >= 780 && minutes < 900));
  return inSession ? 5000 : 60000;
}

export function aShareSourceLabel(source?: string): string {
  return (
    { tencent: '腾讯', sina: '新浪', eastmoney: '东方财富', local: '本地' }[source ?? ''] ?? '—'
  );
}

export function aShareVolumeLabel(unit?: string): string {
  return { shares: '股', fund_units: '份', index_lots: '手（指数汇总）' }[unit ?? ''] ?? '上游单位';
}
