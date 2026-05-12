'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import DashboardShell from '@/components/DashboardShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const NATURE_OPTIONS = [
  'Thesis/Design Subject concerns',
  'Mentoring/Clarification on the Topic of the Subjects Enrolled',
  'Requirements in Courses Enrolled',
  'Concerns about Electives/Tracks in the Curriculum',
  'Concerns on Internship/OJT Matters',
  'Concerns regarding Placement/Employment Opportunities',
  'Concerns regarding Personal/Family, etc.',
  'Others (Please Specify)',
];


function getTimeSlots(start: string, end: string): string[] {
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const slots: string[] = [];
  for (let mins = toMins(start); mins < toMins(end); mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return slots;
}

function formatTime12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const BOOKING_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function BookingCalendar({ specificDate, bookedDates, selected, onSelect }: {
  specificDate: string | undefined;
  bookedDates: string[];
  selected: string;
  onSelect: (dateStr: string) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const initDate = specificDate ? new Date(specificDate + 'T12:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [mounted, setMounted] = useState(false);

  const specificDow = specificDate ? new Date(specificDate + 'T12:00:00').getDay() : -1;
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
        <span className="text-white text-sm font-medium">{BOOKING_MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-medium py-1 ${i === specificDow ? 'text-[#CC0000]' : 'text-gray-700'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isTarget = dateStr === specificDate;
          const isPast = new Date(viewYear, viewMonth, day) < today;
          const isBooked = bookedDates.includes(dateStr);
          const isDisabled = !isTarget || isPast || isBooked;
          const isSelected = selected === dateStr;
          return (
            <button key={dateStr} type="button" disabled={isDisabled} onClick={() => onSelect(dateStr)}
              className={[
                'rounded-lg text-xs py-1.5 font-medium transition-colors w-full',
                isSelected              ? 'bg-[#CC0000] text-white' :
                isTarget && isBooked    ? 'text-gray-700 line-through cursor-not-allowed' :
                isTarget && !isPast     ? 'text-[#CC0000] font-semibold hover:bg-[#CC0000]/20' :
                                          'text-gray-800 cursor-not-allowed',
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

function parseNature(natureStr: string | null): string[] {
  if (!natureStr) return [];
  try {
    const parsed = JSON.parse(natureStr);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [natureStr];
  }
}

type TimeRange = { time_start: string; time_end: string };

type Schedule = {
  id: number;
  professor_id: number;
  professor_name: string;
  department: string;
  day: string;
  time_start: string;
  time_end: string;
  time_ranges?: TimeRange[];
  is_available: boolean;
  location?: string;
  date?: string;
};

type Consultation = {
  id: number;
  professor_name: string;
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

type StudentProfile = {
  full_name: string;
  student_number: string;
  program: string;
  year_level: string;
  email: string;
  phone: string;
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


function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-red-950 border border-red-900/50 flex items-center justify-center text-red-300 text-sm font-semibold flex-shrink-0">
      {initials}
    </div>
  );
}

function NavItem({ icon, label, active, count, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; count?: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-[#CC0000] text-white shadow-lg shadow-red-900/30' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'
      }`}>
      <span className="flex items-center gap-3">{icon}{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-md ${active ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-500'}`}>
          {count}
        </span>
      )}
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

type View = 'book' | 'my' | 'history' | 'profile';

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

export default function StudentDashboard() {
  const router = useRouter();
  const [view, setView] = useState<View>('book');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const [bookingSlot, setBookingSlot] = useState<Schedule | null>(null);
  const [bookForm, setBookForm] = useState({
    nature_of_advising: [] as string[],
    nature_of_advising_specify: '',
    mode: 'F2F',
    date: '',
    time: '',
  });
  const [bookError, setBookError] = useState('');
  const [bookedDates, setBookedDates] = useState<Record<number, string[]>>({});
  const [bookedTimes, setBookedTimes] = useState<Record<string, string[]>>({});

  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [downloadingSlip, setDownloadingSlip] = useState<number | null>(null);
  const [downloadingReceipt, setDownloadingReceipt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadForId = useRef<number | null>(null);

  // Profile
  const [profile, setProfile] = useState<StudentProfile>({
    full_name: '', student_number: '', program: '', year_level: '', email: '', phone: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileMode, setProfileMode] = useState<'view' | 'edit'>('view');
  const [profileBeforeEdit, setProfileBeforeEdit] = useState<StudentProfile | null>(null);

  // Theme
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
    fetchData();
  }, []);

  const fetchData = async () => {
    const [sched, consult, prof] = await Promise.all([
      api.get('/api/schedules', token!),
      api.get('/api/consultations', token!),
      api.get('/api/auth/profile', token!),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    setSchedules((Array.isArray(sched) ? sched : []).filter(s => !s.date || s.date >= today));
    setConsultations(Array.isArray(consult) ? consult : []);
    if (!prof.error) {
      setProfile({
        full_name: prof.full_name || '',
        student_number: prof.student_number || '',
        program: prof.program || '',
        year_level: prof.year_level?.toString() || '',
        email: prof.email || '',
        phone: prof.phone || '',
      });
    }
    setLoading(false);
  };

  const openBookingModal = async (schedule: Schedule) => {
    setBookingSlot(schedule);
    setBookForm({ nature_of_advising: [], nature_of_advising_specify: '', mode: 'F2F', date: '', time: '' });
    setBookError('');
    try {
      const data = await api.get(`/api/consultations/booked-dates?schedule_id=${schedule.id}`, token!);
      if (Array.isArray(data)) setBookedDates(prev => ({ ...prev, [schedule.id]: data }));
    } catch {}
  };

  const toggleNature = (opt: string) => {
    setBookForm(f => {
      const selected = f.nature_of_advising.includes(opt)
        ? f.nature_of_advising.filter(n => n !== opt)
        : [...f.nature_of_advising, opt];
      return {
        ...f,
        nature_of_advising: selected,
        nature_of_advising_specify:
          opt === 'Others (Please Specify)' && f.nature_of_advising.includes(opt) ? '' : f.nature_of_advising_specify,
      };
    });
  };

  const handleBook = async () => {
    if (!bookingSlot) return;
    setBookError('');
    if (bookForm.nature_of_advising.length === 0) { setBookError('Please select at least one nature of advising.'); return; }
    if (bookForm.nature_of_advising.includes('Others (Please Specify)') && !bookForm.nature_of_advising_specify.trim()) {
      setBookError('Please specify the nature of advising.'); return;
    }
    if (!bookForm.date) { setBookError('Please select a date.'); return; }
    if (!bookForm.time) { setBookError('Please select a preferred time.'); return; }

    const data = await api.post('/api/consultations', {
      professor_id: bookingSlot.professor_id,
      schedule_id: bookingSlot.id,
      date: bookForm.date,
      time: bookForm.time,
      nature_of_advising: bookForm.nature_of_advising,
      nature_of_advising_specify: bookForm.nature_of_advising_specify || undefined,
      mode: bookForm.mode,
    }, token!);

    if (data.error) { setBookError(data.error); return; }
    setBookingSlot(null);
    await fetchData();
    setView('my');
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Cancel this consultation?')) return;
    const data = await api.patch(`/api/consultations/${id}/cancel`, {}, token!);
    if (data.error) { alert(data.error); return; }
    fetchData();
  };

  const handleDownloadSlip = async () => {
    setDownloadingSlip(-1);
    try {
      const res = await fetch(`${API_URL}/api/forms/blank-slip`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { alert('Failed to download form template.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'advising-slip-FM-AS-11-02.pdf'; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingSlip(null);
    }
  };

  // Generate and download consultation receipt as PDF
  const handleDownloadReceipt = async (c: Consultation) => {
    setDownloadingReceipt(c.id);
    try {
      const res = await fetch(`${API_URL}/api/forms/advising-slip/${c.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { alert('Failed to generate receipt.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `receipt-consultation-${c.id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingReceipt(null);
    }
  };

  const triggerUpload = (id: number) => {
    uploadForId.current = id;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadForId.current) return;
    const id = uploadForId.current;
    setUploadingId(id);
    e.target.value = '';
    const formData = new FormData();
    formData.append('form', file);
    try {
      const res = await fetch(`${API_URL}/api/forms/upload/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      await fetchData();
    } finally {
      setUploadingId(null);
      uploadForId.current = null;
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg('');
    const data = await api.patch('/api/auth/profile', profile, token!);
    setProfileSaving(false);
    if (data.error) {
      setProfileMsg(data.error);
    } else {
      setProfileMsg('Profile saved successfully.');
      setProfileMode('view');
    }
  };

  const activeConsults = consultations.filter(c => c.status === 'pending' || c.status === 'confirmed').length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingConsultations = consultations.filter(c => c.date >= todayStr);

  const natureLabel = (c: Consultation) => {
    const items = parseNature(c.nature_of_advising);
    return items.map(i =>
      i === 'Others (Please Specify)' && c.nature_of_advising_specify
        ? `Others: ${c.nature_of_advising_specify}` : i
    ).join(', ') || '—';
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg text-white text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600';

  return (
    <DashboardShell weekBadge={false}>
    <div data-theme={isDark ? 'dark' : 'light'} className={`flex h-full ${isDark ? 'bg-[#313338]' : 'bg-[#f5f5f5]'} overflow-hidden`}>
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileSelected} />

      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 flex flex-col bg-[#111] border-r border-white/5 relative z-[60]">
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
          <span className="text-[10px] font-semibold text-[#CC0000] uppercase tracking-widest">Student</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem active={false} onClick={() => router.push('/dashboard/home')} label="Home"
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
          />
          <div className="border-t border-white/5 pt-2 mt-1 space-y-1">
            <NavItem active={view === 'book'} onClick={() => setView('book')} label="Book a Slot"
              count={schedules.length}
              icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
            />
            <NavItem active={view === 'my'} onClick={() => setView('my')} label="My Consultations"
              count={activeConsults || undefined}
              icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /></svg>}
            />
            <NavItem active={view === 'history'} onClick={() => setView('history')} label="History"
              icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>}
            />
            <NavItem active={view === 'profile'} onClick={() => setView('profile')} label="Profile"
              icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" /></svg>}
            />
          </div>
        </nav>

      </aside>

      {/* Main */}
      <main className={`flex-1 overflow-y-auto ${isDark ? 'bg-[#313338]' : 'bg-[#f5f5f5]'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 text-sm">Loading...</p>
          </div>

        ) : view === 'book' ? (
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">Book a Consultation</h1>
              <p className="text-gray-500 text-sm mt-1">{schedules.length} slot{schedules.length !== 1 ? 's' : ''} available</p>
            </div>

            {schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                <p className="text-gray-400 font-medium text-sm">No slots available</p>
                <p className="text-gray-600 text-xs mt-1">Check back later when professors post their schedules</p>
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => (
                  <div key={s.id} className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden hover:border-white/10 transition-colors">
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <Avatar name={s.professor_name} />
                        <div className="flex-1">
                          <h3 className="text-white font-semibold text-sm">{s.professor_name}</h3>
                          <p className="text-gray-500 text-xs mt-0.5">{s.department}</p>
                          {s.location && (
                            <p className="text-gray-600 text-xs mt-0.5">
                              <span className="text-purple-400">F2F: </span>{s.location}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-gray-200 text-sm font-medium">{s.day}</p>
                          {(s.time_ranges?.length
                            ? s.time_ranges
                            : [{ time_start: s.time_start, time_end: s.time_end }]
                          ).map((r, i) => (
                            <p key={i} className="text-gray-500 text-xs mt-0.5 font-mono">
                              {r.time_start?.slice(0, 5)}–{r.time_end?.slice(0, 5)}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Available
                        </span>
                        <button onClick={() => openBookingModal(s)}
                          className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#CC0000] text-white hover:bg-[#aa0000] shadow-lg shadow-red-900/20">
                          Book this slot
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : view === 'history' ? (
          <div className="max-w-4xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">History</h1>
              <p className="text-gray-500 text-sm mt-1">Past consultations grouped by term</p>
            </div>
            {(() => {
              const historyItems = consultations.filter(c =>
                c.status === 'completed' || c.status === 'cancelled' || c.status === 'rescheduled'
              );
              if (historyItems.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                    <p className="text-gray-400 font-medium text-sm">No history yet</p>
                    <p className="text-gray-600 text-xs mt-1">Completed consultations will appear here</p>
                  </div>
                );
              }
              return (
                <div className="space-y-8">
                  {groupByQuarter(historyItems).map(([quarter, items]) => (
                    <div key={quarter}>
                      <div className="flex items-center gap-3 mb-3">
                        <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-widest">{quarter}</p>
                        <span className="text-gray-700 text-xs">{items.length} consultation{items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="rounded-2xl border border-white/5 bg-[#161616] overflow-hidden">
                        <table className="w-full table-fixed">
                          <thead>
                            <tr className="border-b border-white/5">
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[110px]">Date</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Purpose</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[150px]">Adviser</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[155px]">Action Taken</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[100px]">Status</th>
                              <th className="text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide px-4 py-3 w-[80px]">Receipt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {items.map(c => (
                              <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                                  {new Date(c.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs">
                                  <span className="line-clamp-2">{natureLabel(c)}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-300 text-xs truncate">{c.professor_name}</td>
                                <td className="px-4 py-3 text-gray-400 text-xs">
                                  <span className="line-clamp-2">{actionLabel(c.action_taken, c.referral, c.referral_specify)}</span>
                                </td>
                                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                                <td className="px-4 py-3">
                                  {c.status === 'completed' && (
                                    <button
                                      onClick={() => handleDownloadReceipt(c)}
                                      disabled={downloadingReceipt === c.id}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                                      {downloadingReceipt === c.id
                                        ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                        : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                                      }
                                      PDF
                                    </button>
                                  )}
                                </td>
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

        ) : view === 'profile' ? (
          <div className="px-8 py-10">
            <div className="max-w-5xl mx-auto">

              {/* Avatar hero */}
              <div className="relative flex flex-col items-center pb-8 mb-8 border-b border-white/10">
                {profileMode === 'view' && (
                  <button
                    onClick={() => { setProfileBeforeEdit({ ...profile }); setProfileMode('edit'); setProfileMsg(''); }}
                    className="absolute top-0 right-0 px-4 py-2 rounded-lg text-xs font-semibold border border-white/20 bg-[#2a2a2a] text-white hover:bg-[#353535] transition-colors">
                    Edit Profile
                  </button>
                )}

                <div className="w-24 h-24 rounded-full bg-[#7a0000] flex items-center justify-center text-white text-3xl font-bold select-none ring-4 ring-[#CC0000]/15">
                  {profile.full_name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
                </div>

                <h2 className="text-white text-xl font-bold mt-4 text-center">{profile.full_name || '—'}</h2>
                <p className="text-gray-500 text-sm mt-1 text-center">
                  {profile.program ? `${profile.program} · ` : ''}{profile.email || 'No email set'}
                </p>

                <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#CC0000]/10 text-[#ff7777] ring-1 ring-[#CC0000]/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#CC0000]" />
                    Student
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
                        {profileMode === 'view' ? (
                          <span className="text-white text-sm font-medium">{profile.full_name || '—'}</span>
                        ) : (
                          <input className={inputCls} value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">Student No.</span>
                        {profileMode === 'view' ? (
                          <span className="text-white text-sm font-medium font-mono">{profile.student_number || '—'}</span>
                        ) : (
                          <input className={inputCls} value={profile.student_number} onChange={e => setProfile(p => ({ ...p, student_number: e.target.value }))} placeholder="e.g. 2020-12345" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Academic Information */}
                  <div className="rounded-2xl border border-white/10 bg-[#161616] overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-white/10">
                      <p className="text-[10px] font-bold text-[#CC0000] uppercase tracking-widest">Academic Information</p>
                    </div>
                    <div className="divide-y divide-white/10">
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">Program</span>
                        {profileMode === 'view' ? (
                          <span className="text-white text-sm font-medium">{profile.program || '—'}</span>
                        ) : (
                          <input className={inputCls} value={profile.program} onChange={e => setProfile(p => ({ ...p, program: e.target.value }))} placeholder="e.g. BS Computer Science" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">Year Level</span>
                        {profileMode === 'view' ? (
                          <span className="text-white text-sm font-medium">
                            {profile.year_level ? `${profile.year_level}${['','st','nd','rd'][+profile.year_level] ?? 'th'} Year` : '—'}
                          </span>
                        ) : (
                          <input className={inputCls} type="number" min="1" max="6" value={profile.year_level} onChange={e => setProfile(p => ({ ...p, year_level: e.target.value }))} placeholder="1–6" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 px-5 py-3.5">
                        <span className="text-gray-400 text-xs font-medium w-32 flex-shrink-0">School</span>
                        <span className="text-white text-sm font-medium">School of Information Technology</span>
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
                        {profileMode === 'view' ? (
                          <p className="text-white text-sm font-medium break-all">{profile.email || '—'}</p>
                        ) : (
                          <input className={inputCls} type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="your@email.com" />
                        )}
                      </div>
                      <div className="px-5 py-3.5">
                        <p className="text-gray-400 text-xs font-medium mb-1.5">Phone Number</p>
                        {profileMode === 'view' ? (
                          <p className="text-white text-sm font-medium">{profile.phone || '—'}</p>
                        ) : (
                          <input className={inputCls} value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+63 9XX XXX XXXX" />
                        )}
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
                        <p className="text-white text-sm font-medium">Student</p>
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

                  {/* Edit mode actions */}
                  {profileMode === 'edit' && (
                    <div className="rounded-2xl border border-white/5 bg-[#161616] p-5 space-y-4">
                      {profileMsg && (
                        <p className={`text-xs ${profileMsg.includes('success') ? 'text-emerald-400' : 'text-red-400'}`}>{profileMsg}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setProfile({ ...profileBeforeEdit! }); setProfileMode('view'); setProfileMsg(''); }}
                          className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 border border-white/5 hover:bg-white/5 transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleSaveProfile} disabled={profileSaving}
                          className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors disabled:opacity-50">
                          {profileSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>
          </div>

        ) : (
          /* My Consultations */
          <div className="max-w-3xl mx-auto px-8 py-8">
            <div className="mb-7">
              <h1 className="text-white text-2xl font-bold">My Consultations</h1>
              <p className="text-gray-500 text-sm mt-1">{upcomingConsultations.length} upcoming · {activeConsults} active</p>
            </div>

            {upcomingConsultations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-white/5 bg-[#161616]">
                <p className="text-gray-400 font-medium text-sm">No upcoming consultations</p>
                <p className="text-gray-600 text-xs mt-1">Book a slot to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingConsultations.map(c => (
                  <div key={c.id} className="rounded-2xl border border-white/5 bg-[#161616] p-5 hover:border-white/10 transition-colors">
                    <div className="flex items-start gap-4">
                      <Avatar name={c.professor_name} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="text-white font-semibold text-sm">{c.professor_name}</h3>
                          <StatusBadge status={c.status} />
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{natureLabel(c)}</p>
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
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.mode === 'F2F' ? 'bg-purple-400' : 'bg-cyan-400'}`} />
                          <span className={`text-sm font-medium ${c.mode === 'F2F' ? 'text-purple-300' : 'text-cyan-300'}`}>
                            {c.mode === 'F2F' ? 'Face-to-Face' : 'Online'}
                          </span>
                        </div>
                        {c.mode === 'F2F' && c.location && (
                          <p className="text-gray-500 text-xs mt-0.5">{c.location}</p>
                        )}
                        {c.mode === 'OL' && c.status === 'confirmed' && (
                          c.meeting_link
                            ? <a href={c.meeting_link} target="_blank" rel="noopener noreferrer"
                                className="text-cyan-400 text-xs mt-0.5 block hover:underline truncate">
                                Join Meeting →
                              </a>
                            : <p className="text-gray-600 text-xs mt-0.5 italic">No meeting link added yet</p>
                        )}
                      </div>
                    </div>

                    {/* Form actions */}
                    <div className="mt-3.5 pt-3.5 border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        {/* Download blank advising slip template */}
                        <button
                          onClick={handleDownloadSlip}
                          disabled={downloadingSlip === -1}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors disabled:opacity-50">
                          {downloadingSlip === -1
                            ? <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0-3-3m3 3 3-3M3 17V7a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                          }
                          Download Form
                        </button>

                        {/* Upload signed form */}
                        {(c.status === 'pending' || c.status === 'confirmed') && (
                          <button
                            onClick={() => triggerUpload(c.id)}
                            disabled={uploadingId === c.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              c.uploaded_form_path
                                ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 hover:bg-amber-500/20'
                            }`}>
                            {uploadingId === c.id ? (
                              <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                            ) : c.uploaded_form_path ? (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                Form Uploaded · Replace
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8-4-4m0 0L8 8m4-4v12" /></svg>
                                Upload Signed Form
                              </>
                            )}
                          </button>
                        )}

                        {c.status === 'completed' && (
                          <button
                            onClick={() => handleDownloadReceipt(c)}
                            disabled={downloadingReceipt === c.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                            {downloadingReceipt === c.id
                              ? <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                              : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                            }
                            Download Receipt
                          </button>
                        )}

                        {c.status !== 'pending' && c.status !== 'confirmed' && c.uploaded_form_path && (
                          <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            Form submitted
                          </span>
                        )}
                      </div>

                      {(c.status === 'pending' || c.status === 'confirmed') && (
                        <button onClick={() => handleCancel(c.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Booking modal */}
      {bookingSlot && (
        <Modal title={`Book Slot — ${bookingSlot.professor_name}`} onClose={() => setBookingSlot(null)}>
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
              <Avatar name={bookingSlot.professor_name} />
              <div>
                <p className="text-white text-sm font-semibold">{bookingSlot.professor_name}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {bookingSlot.department} · {bookingSlot.day}{' '}
                  {(bookingSlot.time_ranges?.length
                    ? bookingSlot.time_ranges
                    : [{ time_start: bookingSlot.time_start, time_end: bookingSlot.time_end }]
                  ).map(r => `${r.time_start?.slice(0, 5)}–${r.time_end?.slice(0, 5)}`).join(', ')}
                </p>
              </div>
            </div>

            <div>
              <p className="text-gray-500 text-xs mb-2">Nature of Advising <span className="text-gray-700">(select all that apply)</span></p>
              <div className="space-y-1.5">
                {NATURE_OPTIONS.map(opt => {
                  const checked = bookForm.nature_of_advising.includes(opt);
                  return (
                    <label key={opt}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        checked ? 'bg-[#CC0000]/10 ring-1 ring-[#CC0000]/30' : 'bg-[#1a1a1a] hover:bg-white/5'
                      }`}>
                      <span className={`mt-0.5 w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${
                        checked ? 'border-[#CC0000] bg-[#CC0000]' : 'border-gray-600'
                      }`}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      <span className="text-sm text-gray-300">{opt}</span>
                      <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleNature(opt)} />
                    </label>
                  );
                })}
              </div>
              {bookForm.nature_of_advising.includes('Others (Please Specify)') && (
                <input
                  className="mt-2 w-full rounded-lg bg-[#1a1a1a] border border-white/10 text-white text-sm px-3 py-2 focus:outline-none focus:border-[#CC0000]/50 placeholder-gray-600"
                  placeholder="Please specify…"
                  value={bookForm.nature_of_advising_specify}
                  onChange={e => setBookForm(f => ({ ...f, nature_of_advising_specify: e.target.value }))}
                />
              )}
            </div>

            <div>
              <p className="text-gray-500 text-xs mb-1.5">Mode</p>
              <select value={bookForm.mode} onChange={e => setBookForm(f => ({ ...f, mode: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-white text-sm bg-[#1a1a1a] border border-white/10 focus:outline-none focus:border-[#CC0000]/50">
                <option value="F2F">Face-to-Face (F2F)</option>
                <option value="OL">Online (OL)</option>
              </select>
              {bookForm.mode === 'OL' && <p className="text-cyan-400 text-xs mt-1">A meeting link will be generated for you.</p>}
              {bookForm.mode === 'F2F' && bookingSlot.location && <p className="text-purple-400 text-xs mt-1">Location: {bookingSlot.location}</p>}
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1.5">Select Date
                <span className="text-gray-700 ml-1">
                  {bookingSlot.date
                    ? `(${new Date(bookingSlot.date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })})`
                    : `(${bookingSlot.day}s only)`}
                </span>
              </p>
              <BookingCalendar
                specificDate={bookingSlot.date}
                bookedDates={bookedDates[bookingSlot.id] || []}
                selected={bookForm.date}
                onSelect={dateStr => {
                  setBookForm(f => ({ ...f, date: dateStr, time: '' }));
                  const key = `${bookingSlot!.id}-${dateStr}`;
                  if (bookedTimes[key] === undefined) {
                    api.get(`/api/schedules/${bookingSlot!.id}/booked-times?date=${dateStr}`, token!)
                      .then(data => {
                        if (Array.isArray(data)) setBookedTimes(prev => ({ ...prev, [key]: data }));
                      });
                  }
                }}
              />
            </div>

            <div>
              <p className="text-gray-500 text-xs mb-1.5">Preferred Start Time</p>
              {(() => {
                const ranges = bookingSlot.time_ranges?.length
                  ? bookingSlot.time_ranges
                  : [{ time_start: bookingSlot.time_start, time_end: bookingSlot.time_end }];
                const taken = bookedTimes[`${bookingSlot.id}-${bookForm.date}`] || [];
                return (
                  <div className="relative">
                    <select
                      value={bookForm.time}
                      onChange={e => setBookForm(f => ({ ...f, time: e.target.value }))}
                      className={`w-full px-3 py-2.5 pr-9 rounded-lg text-sm bg-[#0f0f0f] border border-white/10 focus:outline-none focus:border-[#CC0000]/50 appearance-none cursor-pointer transition-colors ${
                        bookForm.time ? 'text-white' : 'text-gray-500'
                      }`}>
                      <option value="" disabled>— Select a time —</option>
                      {ranges.map((range, i) => {
                        const slots = getTimeSlots(range.time_start.slice(0, 5), range.time_end.slice(0, 5));
                        const startHour = parseInt(range.time_start.slice(0, 2), 10);
                        const session = startHour < 12 ? 'Morning Session' : 'Afternoon Session';
                        const label = `${session} (${formatTime12(range.time_start.slice(0, 5))} – ${formatTime12(range.time_end.slice(0, 5))})`;
                        return (
                          <optgroup key={i} label={label}>
                            {slots.map(slot => {
                              const isTaken = taken.includes(slot);
                              return (
                                <option key={slot} value={slot} disabled={isTaken}>
                                  {formatTime12(slot)}{isTaken ? ' — Taken' : ''}
                                </option>
                              );
                            })}
                          </optgroup>
                        );
                      })}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                );
              })()}
            </div>

            {bookError && <p className="text-red-400 text-xs">{bookError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setBookingSlot(null)} className="flex-1 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-white/5 transition-colors">
                Cancel
              </button>
              <button onClick={handleBook} className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] transition-colors shadow-lg shadow-red-900/20">
                Confirm Booking
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
    </DashboardShell>
  );
}
