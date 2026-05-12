'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Label } from '@/components/ui/label';
import DashboardShell from '@/components/DashboardShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const REFERRAL_OPTIONS = [
  'Peer Advising (W501-Intramuros / R203-Makati)',
  'Counseling of Personal Concerns (Center for Guidance and Counseling)',
  'Career Advising (Center for Career Services)',
  'Other Office (Please Specify)',
];

function parseNature(natureStr: string | null): string[] {
  if (!natureStr) return [];
  try {
    const parsed = JSON.parse(natureStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [natureStr];
  }
}

type Consultation = {
  id: number;
  student_name: string;
  student_number: string;
  program: string;
  date: string;
  day: string;
  time_start: string;
  time_end: string;
  nature_of_advising: string;
  nature_of_advising_specify: string | null;
  mode: string;
  status: string;
  uploaded_form_path: string | null;
  action_taken: string | null;
  referral: string | null;
  referral_specify: string | null;
  remarks: string | null;
  location?: string;
  meeting_link?: string | null;
};

type TimeRange = { time_start: string; time_end: string };

type Schedule = {
  id: number;
  day: string;
  date?: string;
  time_start: string;
  time_end: string;
  time_ranges?: TimeRange[];
  is_available: boolean;
  location?: string;
  upcoming_count?: number;
};

type ProfProfile = {
  full_name: string;
  department: string;
  email: string;
  phone: string;
  avatar: string | null;
};

const STATUS_STYLES: Record<string, { ring: string; text: string; dot: string; label: string }> = {
  pending:     { ring: 'ring-amber-500/30',   text: 'text-amber-400',   dot: 'bg-amber-400',   label: 'Pending' },
  confirmed:   { ring: 'ring-blue-500/30',    text: 'text-blue-400',    dot: 'bg-blue-400',    label: 'Confirmed' },
  completed:   { ring: 'ring-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Completed' },
  cancelled:   { ring: 'ring-red-500/30',     text: 'text-red-400',     dot: 'bg-red-400',     label: 'Cancelled' },
  rescheduled: { ring: 'ring-orange-500/30',  text: 'text-orange-400',  dot: 'bg-orange-400',  label: 'Rescheduled' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { ring: 'ring-gray-500/30', text: 'text-gray-400', dot: 'bg-gray-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/5 ring-1 ${s.ring} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = (name || '').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 font-semibold flex-shrink-0 ${size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'}`}>
      {initials}
    </div>
  );
}


function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-[#CC0000] text-white shadow-lg shadow-red-900/30' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
      }`}>
      {icon}{label}
    </button>
  );
}

function getQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const m = d.getMonth();
  const y = d.getFullYear();
  const q = m < 3 ? '1st' : m < 6 ? '2nd' : m < 9 ? '3rd' : '4th';
  return `${q} Quarter ${y}`;
}

function groupByQuarter<T extends { date: string }>(items: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getQuarterLabel(item.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries());
}

function actionLabel(action_taken: string | null, referral: string | null, referral_specify: string | null): string {
  if (!action_taken) return '—';
  if (action_taken === 'Referred to' && referral) {
    if (referral === 'Other Office (Please Specify)' && referral_specify) return `Referred to: ${referral_specify}`;
    return `Referred to: ${referral.split(' (')[0]}`;
  }
  return action_taken;
}

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Tab = 'consultations' | 'calendar' | 'schedules' | 'export' | 'history' | 'profile';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#161616] shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-white font-bold text-base">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ScheduleDatePicker({
  selected,
  onSelect,
  disabledDates,
}: {
  selected: string;
  onSelect: (dateStr: string, dayName: string) => void;
  disabledDates: string[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initDate = selected ? new Date(selected + 'T12:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [mounted, setMounted] = useState(false);

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const prevMonth = () => {
    if (isCurrentMonth) return;
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-3 min-h-[220px]" />;

  return (
    <div className="bg-[#0f0f0f] border border-white/10 rounded-xl p-3 select-none">
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} disabled={isCurrentMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-white text-sm font-medium">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-gray-600 text-[10px] font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const date = new Date(viewYear, viewMonth, day);
          const dow = date.getDay();
          const dayName = DAY_NAMES[dow];
          const isPast = date < today;
          const isSunday = dow === 0;
          const hasSlot = disabledDates.includes(dateStr);
          const isDisabled = isPast || isSunday || hasSlot;
          const isSelected = selected === dateStr;
          const isToday = date.getTime() === today.getTime();
          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(dateStr, dayName)}
              className={[
                'rounded-lg text-xs py-1.5 font-medium transition-colors w-full',
                isSelected ? 'bg-[#CC0000] text-white' :
                isDisabled ? 'text-gray-700 cursor-not-allowed' :
                isToday ? 'text-white ring-1 ring-inset ring-[#CC0000]/40 hover:bg-white/10' :
                'text-gray-300 hover:bg-white/10',
              ].join(' ')}>
              {day}
            </button>
          );
        })}
      </div>
      {selected && (
        <p className="text-[#CC0000] text-[10px] text-center mt-2.5 font-medium">
          {new Date(selected + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}

function TimePicker({ value, onChange, dark = true }: { value: string; onChange: (v: string) => void; dark?: boolean }) {
  const parse = (v: string) => {
    if (!v) return { h: '', m: '00', ampm: 'AM' as 'AM' | 'PM' };
    const [hStr, mStr] = v.split(':');
    const h24 = parseInt(hStr, 10);
    return {
      h: String(h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24),
      m: (mStr || '00').padStart(2, '0'),
      ampm: (h24 < 12 ? 'AM' : 'PM') as 'AM' | 'PM',
    };
  };
  const { h, m, ampm } = parse(value);
  const emit = (nh: string, nm: string, na: string) => {
    if (!nh) { onChange(''); return; }
    let h24 = parseInt(nh, 10);
    if (na === 'AM') { if (h24 === 12) h24 = 0; }
    else { if (h24 !== 12) h24 += 12; }
    onChange(`${String(h24).padStart(2, '0')}:${nm}`);
  };
  const HOURS = ['1','2','3','4','5','6','7','8','9','10','11','12'];
  const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const sel = dark
    ? 'bg-[#0a0a0a] border border-white/15 text-white text-sm rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#CC0000]/50 cursor-pointer hover:border-white/30 transition-colors'
    : 'bg-white border border-gray-300 text-gray-900 text-sm rounded-lg px-2.5 py-2 focus:outline-none focus:border-[#CC0000]/60 cursor-pointer hover:border-gray-400 transition-colors';
  return (
    <div className="flex items-center gap-1.5">
      <select value={h} onChange={e => emit(e.target.value, m, ampm)} className={`${sel} w-[4.5rem]`}>
        <option value="">--</option>
        {HOURS.map(hr => <option key={hr} value={hr}>{hr}</option>)}
      </select>
      <span className={`text-sm font-bold select-none ${dark ? 'text-gray-600' : 'text-gray-400'}`}>:</span>
      <select value={m} onChange={e => emit(h, e.target.value, ampm)} className={`${sel} w-[4.5rem]`}>
        {MINS.map(mn => <option key={mn} value={mn}>{mn}</option>)}
      </select>
      <select value={ampm} onChange={e => emit(h, m, e.target.value)} className={`${sel} w-[4.5rem]`}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export default function ProfessorDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('consultations');
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pastSlotsOpen, setPastSlotsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // Complete modal
  const [completingConsult, setCompletingConsult] = useState<Consultation | null>(null);
  const [completeForm, setCompleteForm] = useState({ action_taken: '', referral: '', referral_specify: '', remarks: '' });
  const [completeError, setCompleteError] = useState('');

  // Reschedule modal
  const [reschedulingConsult, setReschedulingConsult] = useState<Consultation | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ referral: '', referral_specify: '', remarks: '' });
  const [rescheduleError, setRescheduleError] = useState('');

  // Add schedule
  const [newSched, setNewSched] = useState({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] as TimeRange[] });
  const [newSchedDate, setNewSchedDate] = useState('');
  const [schedError, setSchedError] = useState('');
  const [showConfirmSched, setShowConfirmSched] = useState(false);
  const [pendingSched, setPendingSched] = useState<typeof newSched | null>(null);

  // Edit schedule modal
  const [editingScheduleSlot, setEditingScheduleSlot] = useState<Schedule | null>(null);
  const [editSched, setEditSched] = useState({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] as TimeRange[] });
  const [editSchedDate, setEditSchedDate] = useState('');
  const [editSchedError, setEditSchedError] = useState('');
  const [showConfirmEdit, setShowConfirmEdit] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{ id: number; date: string } & typeof editSched | null>(null);

  const [downloadingForm, setDownloadingForm] = useState<number | null>(null);

  // Meeting link modal (for confirming OL consultations)
  const [meetingLinkConsult, setMeetingLinkConsult] = useState<Consultation | null>(null);
  const [meetingLinkInput, setMeetingLinkInput] = useState('');

  // Edit meeting link modal (for already-confirmed OL consultations)
  const [editLinkConsult, setEditLinkConsult] = useState<Consultation | null>(null);
  const [editLinkInput, setEditLinkInput] = useState('');

  // Profile
  const [profile, setProfile] = useState<ProfProfile>({ full_name: '', department: '', email: '', phone: '', avatar: null });

  // Theme — synced with DashboardShell's global toggle
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('consultsiya-theme') !== 'light';
    return true;
  });

  useEffect(() => {
    const handler = (e: Event) => setIsDark((e as CustomEvent<{ dark: boolean }>).detail.dark);
    window.addEventListener('consultsiya-theme-change', handler);
    return () => window.removeEventListener('consultsiya-theme-change', handler);
  }, []);

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    const vParam = new URLSearchParams(window.location.search).get('view');
    if (vParam && (['consultations','calendar','schedules','export','history','profile'] as string[]).includes(vParam)) setTab(vParam as Tab);
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [c, s, prof] = await Promise.all([
      api.get('/api/consultations', token!),
      api.get('/api/schedules/mine', token!),
      api.get('/api/auth/profile', token!),
    ]);
    setConsultations(Array.isArray(c) ? c : []);
    setSchedules(Array.isArray(s) ? s : []);
    if (!prof.error) {
      const avatarVal = prof.avatar || null;
      setProfile({
        full_name: prof.full_name || '',
        department: prof.department || '',
        email: prof.email || '',
        phone: prof.phone || '',
        avatar: avatarVal,
      });
      if (avatarVal) localStorage.setItem('consultsiya-avatar', `${API_URL}${avatarVal}`);
      else localStorage.removeItem('consultsiya-avatar');
      localStorage.setItem('consultsiya-name', prof.full_name || '');
    }
    setLoading(false);
  };

  const handleConfirm = async (id: number, meetingLink?: string) => {
    const body = meetingLink ? { meeting_link: meetingLink } : {};
    const data = await api.patch(`/api/consultations/${id}/confirm`, body, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleConfirmWithLink = async () => {
    if (!meetingLinkConsult) return;
    await handleConfirm(meetingLinkConsult.id, meetingLinkInput.trim() || undefined);
    setMeetingLinkConsult(null);
    setMeetingLinkInput('');
  };

  const handleSaveMeetingLink = async () => {
    if (!editLinkConsult) return;
    const data = await api.patch(`/api/consultations/${editLinkConsult.id}/meeting-link`, { meeting_link: editLinkInput.trim() || null }, token!);
    if (data.error) { alert(data.error); return; }
    setEditLinkConsult(null);
    setEditLinkInput('');
    fetchAll();
  };

  const openCompleteModal = (c: Consultation) => {
    setCompletingConsult(c);
    setCompleteForm({ action_taken: '', referral: '', referral_specify: '', remarks: '' });
    setCompleteError('');
  };

  const handleComplete = async () => {
    if (!completingConsult) return;
    if (!completeForm.action_taken) { setCompleteError('Please select an action taken.'); return; }
    if (completeForm.action_taken === 'Referred to' && !completeForm.referral) {
      setCompleteError('Please select a referral option.'); return;
    }
    if (completeForm.referral === 'Other Office (Please Specify)' && !completeForm.referral_specify.trim()) {
      setCompleteError('Please specify the other office.'); return;
    }
    setCompleteError('');
    const data = await api.patch(`/api/consultations/${completingConsult.id}/complete`, completeForm, token!);
    if (data.error) { setCompleteError(data.error); return; }
    setCompletingConsult(null);
    fetchAll();
  };

  const openRescheduleModal = (c: Consultation) => {
    setReschedulingConsult(c);
    setRescheduleForm({ referral: '', referral_specify: '', remarks: '' });
    setRescheduleError('');
  };

  const handleReschedule = async () => {
    if (!reschedulingConsult) return;
    setRescheduleError('');
    const data = await api.patch(`/api/consultations/${reschedulingConsult.id}/reschedule`, rescheduleForm, token!);
    if (data.error) { setRescheduleError(data.error); return; }
    setReschedulingConsult(null);
    fetchAll();
  };

  const handleDownloadStudentForm = async (id: number) => {
    setDownloadingForm(id);
    try {
      const res = await fetch(`${API_URL}/api/forms/download/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Download failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `student-form-${id}`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingForm(null);
    }
  };

  // Schedule add — show confirmation dialog first
  const handleRequestAddSchedule = () => {
    setSchedError('');
    if (!newSchedDate) { setSchedError('Please select a date.'); return; }
    if (newSched.time_ranges.length === 0) { setSchedError('At least one time range is required.'); return; }
    for (const r of newSched.time_ranges) {
      if (!r.time_start || !r.time_end) { setSchedError('Please fill in all time range fields.'); return; }
      if (r.time_start >= r.time_end) { setSchedError('End time must be after start time in each range.'); return; }
    }
    setPendingSched({ ...newSched });
    setShowConfirmSched(true);
  };

  const handleConfirmAddSchedule = async () => {
    if (!pendingSched) return;
    setShowConfirmSched(false);
    const payload = { ...pendingSched, date: newSchedDate };
    console.log('[Schedule] Sending payload to backend:', JSON.stringify(payload));
    const data = await api.post('/api/schedules', payload, token!);
    if (data.error) { setSchedError(data.error); return; }
    console.log('[Schedule] Saved — server returned date:', data.date);
    setNewSched({ day: 'Monday', location: '', time_ranges: [{ time_start: '', time_end: '' }] });
    setNewSchedDate('');
    setPendingSched(null);
    fetchAll();
  };

  // Schedule edit modal
  const openEditModal = (s: Schedule) => {
    setEditingScheduleSlot(s);
    setEditSched({
      day: s.day,
      location: s.location || '',
      time_ranges: s.time_ranges?.length
        ? s.time_ranges.map(r => ({ time_start: r.time_start.slice(0, 5), time_end: r.time_end.slice(0, 5) }))
        : [{ time_start: s.time_start.slice(0, 5), time_end: s.time_end.slice(0, 5) }],
    });
    setEditSchedDate(s.date || '');
    setEditSchedError('');
  };

  const handleRequestEditSchedule = () => {
    setEditSchedError('');
    if (!editSchedDate) { setEditSchedError('Please select a date.'); return; }
    if (editSched.time_ranges.length === 0) { setEditSchedError('At least one time range is required.'); return; }
    for (const r of editSched.time_ranges) {
      if (!r.time_start || !r.time_end) { setEditSchedError('Please fill in all time range fields.'); return; }
      if (r.time_start >= r.time_end) { setEditSchedError('End time must be after start time in each range.'); return; }
    }
    setPendingEdit({ id: editingScheduleSlot!.id, ...editSched, date: editSchedDate });
    setShowConfirmEdit(true);
  };

  const handleConfirmEditSchedule = async () => {
    if (!pendingEdit) return;
    const { id, ...body } = pendingEdit;
    setShowConfirmEdit(false);
    const data = await api.patch(`/api/schedules/${id}`, body, token!);
    if (data.error) { setEditSchedError(data.error); return; }
    setEditingScheduleSlot(null);
    setPendingEdit(null);
    fetchAll();
  };

  const handleDeleteSchedule = async (id: number) => {
    if (!confirm('Delete this schedule slot?')) return;
    const data = await api.delete(`/api/schedules/${id}`, token!);
    if (data.error) { alert(data.error); return; }
    fetchAll();
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    const endpoint = format === 'excel' ? '/api/reports/excel' : '/api/reports/pdf';
    try {
      const res = await fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Export failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `advising-report.${format === 'excel' ? 'xlsx' : 'pdf'}`; a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed. Please try again.'); }
  };

  const visibleConsultations = consultations.filter(c => c.status !== 'cancelled');
  const stats = {
    total: visibleConsultations.length,
    pending: visibleConsultations.filter(c => c.status === 'pending').length,
    completed: visibleConsultations.filter(c => c.status === 'completed').length,
  };

  const natureLabel = (c: Consultation) => {
    const items = parseNature(c.nature_of_advising);
    return items.map(i =>
      i === 'Others (Please Specify)' && c.nature_of_advising_specify
        ? `Others: ${c.nature_of_advising_specify}` : i
    ).join(', ') || '—';
  };

  const radioCls = (selected: boolean) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
      selected ? 'bg-[#CC0000]/10 ring-1 ring-[#CC0000]/30 text-white' : 'bg-[#1a1a1a] text-gray-400 hover:bg-white/5'
    }`;

  const radioBtn = (selected: boolean) => (
    <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
      selected ? 'border-[#CC0000] bg-[#CC0000]' : 'border-gray-600'
    }`}>
      {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
    </span>
  );

  const fieldCls = isDark
    ? 'px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50'
    : 'px-3 py-2 rounded-lg text-gray-900 text-sm bg-white border border-gray-300 focus:outline-none focus:border-[#CC0000]/60';

  // Calendar: group consultations by date for the calendar view
  const bookedByDate = visibleConsultations.reduce<Record<string, Consultation[]>>((acc, c) => {
    if (!acc[c.date]) acc[c.date] = [];
    acc[c.date].push(c);
    return acc;
  }, {});

  const navItems: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'consultations', label: 'My Consultations', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg> },
    { key: 'calendar', label: 'Booking Calendar', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" /></svg> },
    { key: 'schedules', label: 'Manage Schedules', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg> },
    { key: 'export', label: 'Export Report', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4" /></svg> },
    { key: 'history', label: 'History', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg> },
    { key: 'profile', label: 'Profile', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" /></svg> },
  ];

  return (
    <DashboardShell weekBadge={false}>
    <div data-theme={isDark ? 'dark' : 'light'} className={`flex h-full ${isDark ? 'bg-[#0c0c0c]' : 'bg-[#f5f5f5]'} overflow-hidden`}>

      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#111] border-r border-white/5">
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#CC0000] flex items-center justify-center shadow-lg shadow-red-900/40">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">ConsultSiya</p>
              <p className="text-gray-600 text-xs mt-0.5">Mapúa SOIT</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-b border-white/5">
          <span className="text-[10px] font-semibold text-[#CC0000] uppercase tracking-widest">Professor</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem active={false} onClick={() => router.push('/dashboard/home')} label="Home"
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
          />
          <div className="border-t border-white/5 pt-2 mt-1 space-y-1">
            {navItems.map(item => (
              <NavItem key={item.key} active={tab === item.key} onClick={() => setTab(item.key)} label={item.label} icon={item.icon} />
            ))}
          </div>
        </nav>
      </aside>

      {/* Confirmation dialogs */}
      {showConfirmSched && pendingSched && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-4">Confirm New Schedule</h2>
            <div className="space-y-2 mb-5">
              <p className="text-gray-400 text-sm"><span className="text-gray-600">Date:</span> {newSchedDate ? new Date(newSchedDate + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : pendingSched.day}</p>
              {pendingSched.time_ranges.map((r, i) => (
                <p key={i} className="text-gray-400 text-sm"><span className="text-gray-600">Range {i + 1}:</span> {r.time_start} – {r.time_end}</p>
              ))}
              {pendingSched.location && <p className="text-gray-400 text-sm"><span className="text-gray-600">Location:</span> {pendingSched.location}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmSched(false)} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleConfirmAddSchedule} className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors">Save Schedule</button>
            </div>
          </div>
        </div>
      )}

      {editLinkConsult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-1">Edit Meeting Link</h2>
            <p className="text-gray-500 text-sm mb-5">Update the Zoom or Google Meet link for this consultation.</p>
            <div className="mb-5">
              <label className="text-gray-500 text-xs mb-1.5 block">Meeting Link</label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={editLinkInput}
                onChange={e => setEditLinkInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveMeetingLink()}
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setEditLinkConsult(null); setEditLinkInput(''); }} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleSaveMeetingLink} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}

      {meetingLinkConsult && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-1">Confirm Online Consultation</h2>
            <p className="text-gray-500 text-sm mb-5">Provide a Zoom or Google Meet link for the student to join.</p>
            <div className="mb-5">
              <label className="text-gray-500 text-xs mb-1.5 block">Meeting Link</label>
              <input
                type="url"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                value={meetingLinkInput}
                onChange={e => setMeetingLinkInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmWithLink()}
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setMeetingLinkConsult(null); setMeetingLinkInput(''); }} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleConfirmWithLink} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmEdit && pendingEdit && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#161616] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
            <h2 className="text-white font-bold text-lg mb-4">Confirm Schedule Edit</h2>
            <div className="space-y-2 mb-5">
              <p className="text-gray-400 text-sm"><span className="text-gray-600">Date:</span> {pendingEdit.date ? new Date(pendingEdit.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : pendingEdit.day}</p>
              {pendingEdit.time_ranges.map((r, i) => (
                <p key={i} className="text-gray-400 text-sm"><span className="text-gray-600">Range {i + 1}:</span> {r.time_start} – {r.time_end}</p>
              ))}
              {pendingEdit.location && <p className="text-gray-400 text-sm"><span className="text-gray-600">Location:</span> {pendingEdit.location}</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirmEdit(false)} className="flex-1 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={handleConfirmEditSchedule} className="flex-1 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className={`flex-1 overflow-y-auto ${isDark ? 'bg-[#0c0c0c]' : 'bg-[#f5f5f5]'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>

        ) : tab === 'consultations' ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">My Consultations</h1>
              <p className="text-gray-500 text-sm mt-1">Review and manage student consultation requests</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-7">
              {[
                { label: 'Total', value: stats.total, color: 'text-white' },
                { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
                { label: 'Completed', value: stats.completed, color: 'text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-white/5 bg-[#161616] px-4 py-3">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {visibleConsultations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                <p className="text-gray-400 font-medium text-sm">No consultations yet</p>
                <p className="text-gray-600 text-xs mt-1">Students will appear here once they book a slot</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleConsultations.map(c => (
                  <div key={c.id} className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden transition-colors hover:border-white/10">
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <Avatar name={c.student_name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h3 className="text-white font-semibold text-sm">{c.student_name}</h3>
                            <StatusBadge status={c.status} />
                          </div>
                          <p className="text-gray-500 text-xs mt-0.5">{c.student_number} · {c.program}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2.5">
                        <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
                          <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Date & Time</p>
                          <p className="text-gray-200 text-sm font-medium">
                            {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <p className="text-gray-500 text-xs mt-0.5">{c.day} · {c.time_start?.slice(0, 5)}–{c.time_end?.slice(0, 5)}</p>
                        </div>
                        <div className="rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
                          <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Meeting</p>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                            <span className={`text-sm font-medium ${c.mode === 'F2F' ? 'text-purple-300' : 'text-cyan-300'}`}>
                              {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                            </span>
                          </div>
                          {c.mode === 'F2F' && c.location && (
                            <p className="text-gray-500 text-xs mt-0.5 truncate">{c.location}</p>
                          )}
                          {c.mode === 'OL' && c.meeting_link && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <a href={c.meeting_link} target="_blank" rel="noopener noreferrer"
                                className="text-cyan-400 text-xs truncate hover:underline flex-1 min-w-0">
                                Join Meeting →
                              </a>
                              {c.status === 'confirmed' && (
                                <button
                                  onClick={() => { setEditLinkConsult(c); setEditLinkInput(c.meeting_link || ''); }}
                                  className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 p-0.5 rounded"
                                  title="Edit meeting link">
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 0 1 2.828 2.828L11.828 15.828a2 2 0 0 1-1.414.586H7v-3a2 2 0 0 1 .586-1.414z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                          {c.mode === 'OL' && c.status === 'confirmed' && !c.meeting_link && (
                            <button
                              onClick={() => { setEditLinkConsult(c); setEditLinkInput(''); }}
                              className="text-cyan-600 hover:text-cyan-400 text-xs mt-0.5 transition-colors">
                              + Add Meeting Link
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg bg-white/3 border border-white/5 px-3 py-2.5">
                        <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1">Nature of Advising</p>
                        <p className="text-gray-200 text-sm line-clamp-2">{natureLabel(c)}</p>
                      </div>

                      <div className="mt-3.5 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {c.uploaded_form_path && (
                            <button
                              onClick={() => handleDownloadStudentForm(c.id)}
                              disabled={downloadingForm === c.id}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                              {downloadingForm === c.id
                                ? <span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                                : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                              }
                              Student Form
                            </button>
                          )}
                        </div>

                        {(c.status === 'pending' || c.status === 'confirmed') && (
                          <div className="flex items-center gap-2">
                            {c.status === 'pending' && (
                              <button
                                onClick={() => c.mode === 'OL'
                                  ? (setMeetingLinkConsult(c), setMeetingLinkInput(''))
                                  : handleConfirm(c.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                                Confirm
                              </button>
                            )}
                            <button onClick={() => openRescheduleModal(c)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">
                              Reschedule
                            </button>
                            <button onClick={() => openCompleteModal(c)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#CC0000]/10 text-[#ff5555] hover:bg-[#CC0000]/20">
                              Mark Completed
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : tab === 'calendar' ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Booking Calendar</h1>
              <p className="text-gray-500 text-sm mt-1">Overview of student bookings by date</p>
            </div>
            {visibleConsultations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/5 bg-[#161616]">
                <p className="text-gray-400 text-sm">No upcoming bookings</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(bookedByDate)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([date, consultList]) => {
                    const isPast = new Date(date) < new Date(new Date().toDateString());
                    return (
                      <div key={date} className={`rounded-2xl border bg-[#161616] overflow-hidden ${isPast ? 'border-white/5 opacity-60' : 'border-white/10'}`}>
                        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
                          <div>
                            <p className="text-white font-semibold text-sm">
                              {new Date(date).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${isPast ? 'bg-gray-500/10 text-gray-500' : 'bg-[#CC0000]/10 text-[#CC0000]'}`}>
                              {isPast ? 'Past' : 'Upcoming'}
                            </span>
                            <span className="text-gray-600 text-xs">{consultList.length} booking{consultList.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="divide-y divide-white/5">
                          {consultList.map(c => (
                            <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <Avatar name={c.student_name} size="sm" />
                                <div>
                                  <p className="text-white text-sm font-medium">{c.student_name}</p>
                                  <p className="text-gray-600 text-xs">{c.time_start?.slice(0, 5)}–{c.time_end?.slice(0, 5)} · {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}</p>
                                </div>
                              </div>
                              <StatusBadge status={c.status} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Slot availability summary */}
            {(() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const upcomingSlots = schedules
                .filter(s => s.date && s.date >= todayStr)
                .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.time_start.localeCompare(b.time_start));
              return (
                <div className="mt-8">
                  <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest mb-3">Your Slots ({upcomingSlots.length})</p>
                  {upcomingSlots.length === 0 ? (
                    <div className="text-center py-10 rounded-2xl border border-white/5 bg-[#161616]">
                      <p className="text-gray-500 text-sm">No slots created yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {upcomingSlots.map(s => {
                        const booked = Number(s.upcoming_count) > 0;
                        return (
                          <div key={s.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/5 bg-[#161616]">
                            <div className="flex items-center gap-3">
                              <span className={`w-2 h-2 rounded-full ${booked ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                              <span className="text-white text-sm">
                                {new Date(s.date! + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-gray-400 text-sm font-mono">{s.time_start?.slice(0, 5)} – {s.time_end?.slice(0, 5)}</span>
                            </div>
                            <span className={`text-xs ${booked ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {booked ? `${s.upcoming_count} booked` : 'Available'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

        ) : tab === 'schedules' ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Manage Schedules</h1>
              <p className="text-gray-500 text-sm mt-1">Add or edit your available consultation time slots</p>
            </div>

            {/* Add new slot form */}
            <div className="rounded-2xl border border-white/5 bg-[#161616] p-5 mb-6">
              <p className="text-white text-sm font-semibold mb-4">Add New Slot</p>
              <div className="mb-3">
                <Label className="text-gray-500 text-xs mb-1.5 block">Date</Label>
                <ScheduleDatePicker
                  selected={newSchedDate}
                  onSelect={(dateStr, dayName) => { setNewSchedDate(dateStr); setNewSched(s => ({ ...s, day: dayName })); }}
                  disabledDates={schedules.map(s => s.date).filter((d): d is string => !!d)}
                />
              </div>
              <div className="mb-3">
                <Label className="text-gray-500 text-xs mb-1.5 block">Location (F2F, optional)</Label>
                <input
                  type="text"
                  value={newSched.location}
                  onChange={e => setNewSched(s => ({ ...s, location: e.target.value }))}
                  placeholder="e.g. Room 201"
                  className={`w-full ${fieldCls} ${isDark ? 'placeholder-gray-600' : 'placeholder-gray-400'}`}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-gray-500 text-xs">Time Ranges</Label>
                  <button type="button"
                    onClick={() => setNewSched(s => ({ ...s, time_ranges: [...s.time_ranges, { time_start: '', time_end: '' }] }))}
                    className="text-xs text-[#CC0000] hover:text-red-400 transition-colors font-medium">
                    + Add Time Range
                  </button>
                </div>
                <div className="space-y-2">
                  {newSched.time_ranges.map((r, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-gray-600 text-[10px] mb-1 block">Start</Label>
                          <TimePicker
                            value={r.time_start}
                            onChange={v => setNewSched(s => ({ ...s, time_ranges: s.time_ranges.map((x, j) => j === i ? { ...x, time_start: v } : x) }))}
                            dark={isDark}
                          />
                        </div>
                        <div>
                          <Label className="text-gray-600 text-[10px] mb-1 block">End</Label>
                          <TimePicker
                            value={r.time_end}
                            onChange={v => setNewSched(s => ({ ...s, time_ranges: s.time_ranges.map((x, j) => j === i ? { ...x, time_end: v } : x) }))}
                            dark={isDark}
                          />
                        </div>
                      </div>
                      {newSched.time_ranges.length > 1 && (
                        <button type="button"
                          onClick={() => setNewSched(s => ({ ...s, time_ranges: s.time_ranges.filter((_, j) => j !== i) }))}
                          className="pb-1.5 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none">
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {schedError && <p className="text-red-400 text-xs mt-2">{schedError}</p>}
              <button onClick={handleRequestAddSchedule}
                className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors shadow-lg shadow-red-900/20">
                Add Slot
              </button>
            </div>

            {(() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const activeSlots = schedules.filter(s => s.date && s.date >= todayStr);
              const pastSlots   = schedules.filter(s => s.date && s.date < todayStr)
                .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

              const renderSlot = (s: Schedule, dimmed = false) => {
                const hasBookings = Number(s.upcoming_count) > 0;
                return (
                  <div key={s.id} className={`rounded-xl border border-white/5 bg-[#161616] overflow-hidden transition-colors ${dimmed ? 'opacity-50' : 'hover:border-white/10'}`}>
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dimmed ? 'bg-gray-600' : hasBookings ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <div>
                          <span className={`text-sm font-medium ${dimmed ? 'text-gray-500' : 'text-white'}`}>
                            {s.date
                              ? new Date(s.date + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                              : s.day}
                          </span>
                        </div>
                        <span className="text-gray-400 text-sm font-mono">
                          {(s.time_ranges?.length ? s.time_ranges : [{ time_start: s.time_start, time_end: s.time_end }])
                            .map(r => `${r.time_start?.slice(0, 5)}–${r.time_end?.slice(0, 5)}`).join(', ')}
                        </span>
                        {s.location && <span className="text-gray-600 text-xs">{s.location}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {!dimmed && (
                          <span className={`text-xs ${hasBookings ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {hasBookings ? `${s.upcoming_count} upcoming` : 'Available'}
                          </span>
                        )}
                        <button onClick={() => openEditModal(s)}
                          className="px-2.5 py-1 rounded-lg text-xs text-blue-400 hover:bg-blue-500/10 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => handleDeleteSchedule(s.id)}
                          className="px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* ── Active slots ── */}
                  <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-widest mb-3">
                    Your Slots ({activeSlots.length})
                  </p>
                  {activeSlots.length === 0 ? (
                    <div className="text-center py-12 rounded-2xl border border-white/5 bg-[#161616]">
                      <p className="text-gray-500 text-sm">No slots created yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">{activeSlots.map(s => renderSlot(s))}</div>
                  )}

                  {/* ── Past slots (collapsible) ── */}
                  {pastSlots.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() => setPastSlotsOpen(o => !o)}
                        className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-gray-700 hover:text-gray-500 transition-colors mb-2"
                      >
                        <svg
                          className={`w-3 h-3 transition-transform duration-200 ${pastSlotsOpen ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        Past Slots ({pastSlots.length})
                      </button>
                      {pastSlotsOpen && (
                        <div className="space-y-2">{pastSlots.map(s => renderSlot(s, true))}</div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

        ) : tab === 'history' ? (
          <div className="max-w-4xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">History</h1>
              <p className="text-gray-500 text-sm mt-1">Past advising records grouped by term</p>
            </div>
            {(() => {
              const historyItems = consultations.filter(c => c.status === 'completed' || c.status === 'rescheduled');
              if (historyItems.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No history yet</p>
                    <p className="text-gray-600 text-xs mt-1">Completed advising sessions will appear here</p>
                  </div>
                );
              }
              return (
                <div className="space-y-8">
                  {groupByQuarter(historyItems).map(([quarter, items]) => (
                    <div key={quarter}>
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">{quarter}</p>
                        <span className="text-gray-700 text-xs">{items.length} session{items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden">
                        <table className="w-full table-fixed">
                          <thead>
                            <tr className="border-b border-white/5">
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[110px]">Date</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[160px]">Student</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Purpose</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[170px]">Action Taken</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[110px]">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {items.map(c => (
                              <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                                  {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="px-4 py-3 text-gray-300 text-xs">
                                  <p className="truncate font-medium">{c.student_name}</p>
                                  <p className="text-gray-600 text-[10px] mt-0.5">{c.student_number}</p>
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs">
                                  <span className="line-clamp-2">{natureLabel(c)}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs">
                                  <span className="line-clamp-2">{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span>
                                </td>
                                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

        ) : tab === 'profile' ? (
          <div className="px-8 py-10">
            <div className="max-w-5xl mx-auto">

              {/* Avatar hero */}
              <div className="relative flex flex-col items-center pb-8 mb-8 border-b border-white/10">
                <button
                  onClick={() => router.push('/settings')}
                  className="absolute top-0 right-0 px-4 py-2 rounded-lg text-xs font-semibold bg-[#CC0000] text-white hover:opacity-90 transition-opacity">
                  Edit Profile
                </button>

                <div className="w-24 h-24 rounded-full overflow-hidden bg-[#7a0000] flex items-center justify-center text-white text-3xl font-bold select-none ring-4 ring-[#CC0000]/15 flex-shrink-0">
                  {profile.avatar
                    ? <img src={`${API_URL}${profile.avatar}`} alt="avatar" className="w-full h-full object-cover" />
                    : profile.full_name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'
                  }
                </div>

                <h2 className="text-white text-xl font-bold mt-4 text-center">{profile.full_name || '—'}</h2>
                <p className="text-gray-500 text-sm mt-1 text-center">
                  {profile.department ? `${profile.department} · ` : ''}{profile.email || 'No email set'}
                </p>

                <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#CC0000]/10 text-[#ff7777] ring-1 ring-[#CC0000]/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#CC0000]" />
                    Faculty
                  </span>
                  <span className="text-gray-700 text-xs">·</span>
                  <span className="text-gray-500 text-xs">Mapúa University</span>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-[3fr_2fr] gap-5 items-start">

                {/* Left column */}
                <div className="space-y-5">

                  {/* Personal Information */}
                  <div className="rounded-2xl border border-white/10 bg-[#161616] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-white/10">
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Personal Information</p>
                    </div>
                    <div className="divide-y divide-white/10">
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">Full Name</span>
                        <span className="text-white text-sm font-medium">{profile.full_name || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Faculty Information */}
                  <div className="rounded-2xl border border-white/10 bg-[#161616] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-white/10">
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Faculty Information</p>
                    </div>
                    <div className="divide-y divide-white/10">
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">Department</span>
                        <span className="text-white text-sm font-medium">{profile.department || '—'}</span>
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">School</span>
                        <span className="text-white text-sm font-medium">School of Information Technology</span>
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">Role</span>
                        <span className="text-white text-sm font-medium">Faculty · Academic Adviser</span>
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">University</span>
                        <span className="text-white text-sm font-medium">Mapúa University</span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Right column */}
                <div className="space-y-5">

                  {/* Contact Information */}
                  <div className="rounded-2xl border border-white/10 bg-[#161616] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-white/10">
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Contact Information</p>
                    </div>
                    <div className="divide-y divide-white/10">
                      <div className="px-5 py-3.5">
                        <p className="text-gray-400 text-xs font-medium mb-1.5">Email Address</p>
                        <p className="text-white text-sm font-medium break-all">{profile.email || '—'}</p>
                      </div>
                      <div className="px-5 py-3.5">
                        <p className="text-gray-400 text-xs font-medium mb-1.5">Phone Number</p>
                        <p className="text-white text-sm font-medium">{profile.phone || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Account */}
                  <div className="rounded-2xl border border-white/10 bg-[#161616] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-white/10">
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Account</p>
                    </div>
                    <div className="divide-y divide-white/10">
                      <div className="px-5 py-3.5">
                        <p className="text-gray-400 text-xs font-medium mb-1.5">Role</p>
                        <p className="text-white text-sm font-medium">Professor</p>
                      </div>
                      <div className="px-5 py-3.5">
                        <p className="text-gray-400 text-xs font-medium mb-1.5">Status</p>
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          </div>

        ) : (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Export Report</h1>
              <p className="text-gray-500 text-sm mt-1">Download your faculty academic advising report</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleExport('excel')}
                className="rounded-2xl border border-white/5 bg-[#161616] hover:border-emerald-500/20 hover:bg-emerald-500/5 p-6 text-left transition-all group">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z" />
                  </svg>
                </div>
                <p className="text-white font-semibold text-sm">Excel Spreadsheet</p>
                <p className="text-gray-600 text-xs mt-1">Download full data as .xlsx</p>
              </button>
              <button onClick={() => handleExport('pdf')}
                className="rounded-2xl border border-white/5 bg-[#161616] hover:border-blue-500/20 hover:bg-blue-500/5 p-6 text-left transition-all group">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
                  </svg>
                </div>
                <p className="text-white font-semibold text-sm">PDF Document</p>
                <p className="text-gray-600 text-xs mt-1">Download formatted report as .pdf</p>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Complete modal */}
      {completingConsult && (
        <Modal title="Mark as Completed" onClose={() => setCompletingConsult(null)}>
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <Avatar name={completingConsult.student_name} size="sm" />
              <div>
                <p className="text-white text-sm font-semibold">{completingConsult.student_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{completingConsult.student_number} · {new Date(completingConsult.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-2">Action Taken</p>
              <div className="space-y-1.5">
                {['Resolved', 'For Follow-up', 'Referred to'].map(opt => (
                  <label key={opt} className={radioCls(completeForm.action_taken === opt)}>
                    {radioBtn(completeForm.action_taken === opt)}
                    {opt}
                    <input type="radio" className="sr-only" checked={completeForm.action_taken === opt}
                      onChange={() => { setCompleteForm(f => ({ ...f, action_taken: opt, referral: '', referral_specify: '' })); setCompleteError(''); }} />
                  </label>
                ))}
              </div>
            </div>
            {completeForm.action_taken === 'Referred to' && (
              <div>
                <p className="text-gray-500 text-xs mb-2">Referred To</p>
                <div className="space-y-1.5">
                  {REFERRAL_OPTIONS.map(opt => (
                    <label key={opt} className={radioCls(completeForm.referral === opt)}>
                      {radioBtn(completeForm.referral === opt)}
                      {opt}
                      <input type="radio" className="sr-only" checked={completeForm.referral === opt}
                        onChange={() => { setCompleteForm(f => ({ ...f, referral: opt, referral_specify: '' })); setCompleteError(''); }} />
                    </label>
                  ))}
                </div>
                {completeForm.referral === 'Other Office (Please Specify)' && (
                  <input className="mt-2 w-full rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
                    placeholder="Please specify the office…"
                    value={completeForm.referral_specify}
                    onChange={e => { setCompleteForm(f => ({ ...f, referral_specify: e.target.value })); setCompleteError(''); }} />
                )}
              </div>
            )}
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
              <textarea value={completeForm.remarks} onChange={e => setCompleteForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className="w-full rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 resize-none placeholder-gray-600"
                placeholder="Additional remarks…" />
            </div>
            {completeError && <p className="text-red-400 text-xs">{completeError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setCompletingConsult(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleComplete} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                Submit & Mark Completed
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reschedule modal */}
      {reschedulingConsult && (
        <Modal title="Mark as Rescheduled" onClose={() => setReschedulingConsult(null)}>
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <Avatar name={reschedulingConsult.student_name} size="sm" />
              <div>
                <p className="text-white text-sm font-semibold">{reschedulingConsult.student_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{reschedulingConsult.student_number} · {new Date(reschedulingConsult.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <p className="text-gray-500 text-xs">This marks the consultation as rescheduled (referred/moved to another session).</p>
            <div>
              <p className="text-gray-500 text-xs mb-2">Referred To (optional)</p>
              <div className="space-y-1.5">
                {REFERRAL_OPTIONS.map(opt => (
                  <label key={opt} className={radioCls(rescheduleForm.referral === opt)}>
                    {radioBtn(rescheduleForm.referral === opt)}
                    {opt}
                    <input type="radio" className="sr-only" checked={rescheduleForm.referral === opt}
                      onChange={() => setRescheduleForm(f => ({ ...f, referral: opt, referral_specify: '' }))} />
                  </label>
                ))}
              </div>
              {rescheduleForm.referral === 'Other Office (Please Specify)' && (
                <input className="mt-2 w-full rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
                  placeholder="Specify office…"
                  value={rescheduleForm.referral_specify}
                  onChange={e => setRescheduleForm(f => ({ ...f, referral_specify: e.target.value }))} />
              )}
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Remarks (optional)</Label>
              <textarea value={rescheduleForm.remarks} onChange={e => setRescheduleForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className="w-full rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 resize-none placeholder-gray-600"
                placeholder="Reason for rescheduling…" />
            </div>
            {rescheduleError && <p className="text-red-400 text-xs">{rescheduleError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setReschedulingConsult(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleReschedule} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors">
                Mark as Rescheduled
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit schedule modal */}
      {editingScheduleSlot && (
        <Modal title="Edit Schedule Slot" onClose={() => setEditingScheduleSlot(null)}>
          <div className="px-5 py-5 space-y-4">
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Date</Label>
              <ScheduleDatePicker
                selected={editSchedDate}
                onSelect={(dateStr, dayName) => { setEditSchedDate(dateStr); setEditSched(f => ({ ...f, day: dayName })); }}
                disabledDates={schedules.filter(s => s.id !== editingScheduleSlot!.id).map(s => s.date).filter((d): d is string => !!d)}
              />
            </div>
            <div>
              <Label className="text-gray-500 text-xs mb-1.5 block">Location</Label>
              <input type="text" value={editSched.location} onChange={e => setEditSched(f => ({ ...f, location: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-500 text-xs">Time Ranges</Label>
                <button type="button"
                  onClick={() => setEditSched(f => ({ ...f, time_ranges: [...f.time_ranges, { time_start: '', time_end: '' }] }))}
                  className="text-xs text-[#CC0000] hover:text-red-400 transition-colors font-medium">
                  + Add Time Range
                </button>
              </div>
              <div className="space-y-2">
                {editSched.time_ranges.map((r, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-gray-600 text-[10px] mb-1 block">Start</Label>
                        <TimePicker
                          value={r.time_start}
                          onChange={v => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.map((x, j) => j === i ? { ...x, time_start: v } : x) }))}
                        />
                      </div>
                      <div>
                        <Label className="text-gray-600 text-[10px] mb-1 block">End</Label>
                        <TimePicker
                          value={r.time_end}
                          onChange={v => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.map((x, j) => j === i ? { ...x, time_end: v } : x) }))}
                        />
                      </div>
                    </div>
                    {editSched.time_ranges.length > 1 && (
                      <button type="button"
                        onClick={() => setEditSched(f => ({ ...f, time_ranges: f.time_ranges.filter((_, j) => j !== i) }))}
                        className="pb-1.5 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none">
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {editSchedError && <p className="text-red-400 text-xs">{editSchedError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditingScheduleSlot(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleRequestEditSchedule} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
    </DashboardShell>
  );
}
