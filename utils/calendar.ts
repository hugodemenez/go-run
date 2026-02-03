/**
 * Calendar utilities for infinite week-based grid.
 * Weeks start on Sunday (ISO would be Monday; change getWeekStart if you prefer).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Monday as start of week (ISO). Use 0 for Sunday. */
const WEEK_START_DAY = 0; // 0 = Sunday, 1 = Monday

export interface DayInfo {
  date: Date;
  dayOfMonth: number;
  month: number;
  year: number;
  isToday: boolean;
  isWeekend: boolean;
}

/** Get the start of the week (Sunday or Monday) for a given date. */
export function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = (day - WEEK_START_DAY + 7) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Get the 7 dates (week start + 6 days) for a week. */
export function getWeekDates(weekStart: Date): Date[] {
  const dates: Date[] = [];
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * MS_PER_DAY);
    dates.push(d);
  }
  return dates;
}

/** Convert week index to week start date. Week 0 = reference week. */
const REFERENCE_WEEK_START = getWeekStart(new Date(2020, 0, 1));

export function weekIndexToStartDate(weekIndex: number): Date {
  const start = new Date(REFERENCE_WEEK_START);
  start.setDate(start.getDate() + weekIndex * 7);
  return start;
}

export function getWeekInfo(weekStart: Date): DayInfo[] {
  return getWeekDates(weekStart).map((date) => {
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    const day = date.getDay();
    const isWeekend = day === 0 || day === 6;
    return {
      date,
      dayOfMonth: date.getDate(),
      month: date.getMonth(),
      year: date.getFullYear(),
      isToday,
      isWeekend,
    };
  });
}

export function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + start.getDay() + 1) / 7);
}

export function dateToWeekIndex(date: Date): number {
  const weekStart = getWeekStart(date);
  const diffMs = weekStart.getTime() - REFERENCE_WEEK_START.getTime();
  return Math.round(diffMs / (7 * MS_PER_DAY));
}

/** Number of weeks to render (past and future from "current" week). */
export const TOTAL_WEEKS = 200;

/** Current week index relative to REFERENCE_WEEK_START. */
export function getCurrentWeekIndex(): number {
  const now = new Date();
  const currentWeekStart = getWeekStart(now);
  const diffMs = currentWeekStart.getTime() - REFERENCE_WEEK_START.getTime();
  return Math.round(diffMs / (7 * MS_PER_DAY));
}

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
