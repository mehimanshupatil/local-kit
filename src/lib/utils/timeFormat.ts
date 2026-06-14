import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

export function fmtTime(sec: number): string {
  return dayjs.duration(Math.round(sec * 1000)).format('m:ss.S');
}
