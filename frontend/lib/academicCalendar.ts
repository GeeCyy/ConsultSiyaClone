// Academic calendar configuration for Mapúa University
// Adjust TERM_START and TOTAL_WEEKS to match the current semester.

export type TermConfig = {
  label: string;
  start: Date;
  totalWeeks: number;
  prelimWeek?: number;
  midtermWeek: number;
  finalsWeek: number;
  // Weeks that are holidays/no class (1-based)
  holidayWeeks?: number[];
  // Map of week number → "In-Person" | "Online"
  modeByWeek?: Record<number, 'In-Person' | 'Online'>;
};

// ── Current term ──────────────────────────────────────────────────────────────
// 2nd Semester 2025–2026  (January 12 → May 16, 2026)
export const CURRENT_TERM: TermConfig = {
  label: '2nd Semester, A.Y. 2025–2026',
  start: new Date('2026-01-12T00:00:00'),
  totalWeeks: 18,
  midtermWeek: 7,
  finalsWeek: 15,
  holidayWeeks: [8],               // Midterm break
  modeByWeek: {
    1: 'In-Person',  2: 'In-Person',  3: 'In-Person',  4: 'In-Person',
    5: 'In-Person',  6: 'In-Person',  7: 'In-Person',  8: 'Online',
    9: 'In-Person', 10: 'In-Person', 11: 'In-Person', 12: 'In-Person',
    13: 'In-Person', 14: 'In-Person', 15: 'In-Person', 16: 'Online',
    17: 'In-Person', 18: 'In-Person',
  },
};

export function getAcademicWeek(term: TermConfig, date: Date = new Date()): number | null {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const diff = date.getTime() - term.start.getTime();
  if (diff < 0) return null; // before term
  const week = Math.floor(diff / msPerWeek) + 1;
  if (week > term.totalWeeks) return null; // after term
  return week;
}

export function getWeekMode(term: TermConfig, week: number): 'In-Person' | 'Online' {
  return term.modeByWeek?.[week] ?? 'In-Person';
}

export function daysUntil(target: Date, from: Date = new Date()): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((target.getTime() - from.getTime()) / msPerDay));
}

export function getTermDates(term: TermConfig) {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const midtermDate = new Date(term.start.getTime() + (term.midtermWeek - 1) * msPerWeek);
  const finalsDate = new Date(term.start.getTime() + (term.finalsWeek - 1) * msPerWeek);
  const endDate = new Date(term.start.getTime() + term.totalWeeks * msPerWeek);
  return { midtermDate, finalsDate, endDate };
}

export function getTermProgress(term: TermConfig, date: Date = new Date()): number {
  const { endDate } = getTermDates(term);
  const total = endDate.getTime() - term.start.getTime();
  const elapsed = date.getTime() - term.start.getTime();
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

// School days calendar for the current term (true = school day, false = holiday/break)
// You can expand this with actual PH holidays for finer accuracy.
const PH_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-02-25', // People Power
  '2026-04-02', // Maundy Thursday
  '2026-04-03', // Good Friday
  '2026-04-09', // Araw ng Kagitingan
  '2026-05-01', // Labor Day
];

export function isSchoolDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false; // Weekend
  const iso = date.toISOString().slice(0, 10);
  if (PH_HOLIDAYS_2026.includes(iso)) return false;
  return true;
}

export function isHoliday(date: Date): boolean {
  const iso = date.toISOString().slice(0, 10);
  return PH_HOLIDAYS_2026.includes(iso);
}

export function isExamWeek(term: TermConfig, date: Date): boolean {
  const week = getAcademicWeek(term, date);
  if (!week) return false;
  return week === term.midtermWeek || week === term.finalsWeek;
}
