'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const UPDATES = [
  {
    version: 'v1.2.0',
    date: 'May 2026',
    items: [
      'Account approval flow for new registrations',
      'Login lockout after 5 failed attempts',
      'Multiple time ranges per schedule slot',
      'Rescheduled consultation status added',
    ],
  },
  {
    version: 'v1.1.0',
    date: 'Apr 2026',
    items: [
      'Digital advising slip generation (PDF)',
      'File upload for signed consultation forms',
      'Professor report exports (Excel & PDF)',
      'Online meeting link support for OL sessions',
    ],
  },
  {
    version: 'v1.0.0',
    date: 'Mar 2026',
    items: [
      'Initial release of ConsultSiya',
      'Student, Professor, and Admin dashboards',
      'Booking, confirmation, and completion flow',
      'Role-based access control',
    ],
  },
];

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0 1 12 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 0 1 1.563-3.029m5.858.908a3 3 0 1 1 4.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532 3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0 1 12 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 0 1-4.132 4.411m0 0L21 21" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setSuccess('Account created! Please wait for admin approval before logging in.');
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleLogin = async () => {
    setError('');
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!emailRe.test(email)) { setError('Please enter a valid email address.'); return; }
    if (!password) { setError('Password is required.'); return; }

    setLoading(true);
    const data = await api.post('/api/auth/login', { email: email.trim(), password });

    if (data.token) {
      setLocked(false);
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      const dest = data.role === 'admin' ? '/dashboard/admin' : '/dashboard/home';
      router.push(dest);
    } else {
      if (data.locked) setLocked(true);
      setError(data.error || 'Login failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ backgroundColor: '#1e1f22' }}>
      <div className="flex flex-col lg:flex-row w-full max-w-4xl gap-6">

        {/* ── Login Form ──────────────────────────────────────────────────── */}
        <div
          className="w-full lg:max-w-md flex-shrink-0 px-8 py-10 rounded-2xl border border-white/10 flex flex-col justify-center"
          style={{ backgroundColor: '#2b2d31' }}
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold" style={{ color: '#CC0000' }}>ConsultSiya</h1>
            <p className="text-gray-400 text-sm mt-1">SOIT Academic Consultation System</p>
            <p className="text-gray-500 text-xs mt-1">Mapúa University</p>
          </div>

          {success && (
            <div className="mb-4 px-4 py-2 rounded-md text-sm" style={{ backgroundColor: '#003a0e', color: '#6bff9e' }}>
              {success}
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm border" style={{ backgroundColor: '#3a0000', color: '#ff6b6b', borderColor: '#7f1d1d' }}>
              {locked && <p className="font-semibold mb-0.5">Account Locked</p>}
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="border text-white placeholder-gray-500"
                style={{ backgroundColor: '#383a40', borderColor: 'rgba(255,255,255,0.1)' }}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-gray-300">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="border text-white placeholder-gray-500 pr-10"
                  style={{ backgroundColor: '#383a40', borderColor: 'rgba(255,255,255,0.1)' }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <Button
              className="w-full text-white font-semibold mt-2"
              style={{ backgroundColor: '#CC0000' }}
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Sign In'}
            </Button>
          </div>

          <p className="text-center text-sm mt-3">
            <Link href="/forgot-password" className="text-gray-500 hover:text-[#CC0000] transition-colors text-xs">
              Forgot password?
            </Link>
          </p>

          <p className="text-center text-sm text-gray-500 mt-3">
            No account yet?{' '}
            <Link href="/register" className="text-[#CC0000] hover:underline">Register</Link>
          </p>
          <p className="text-center text-gray-600 text-xs mt-4">© 2026 Mapúa University SOIT</p>
        </div>

        {/* ── Developer Updates Board ─────────────────────────────────────── */}
        <div
          className="flex flex-col flex-1 rounded-2xl border border-white/10 overflow-hidden"
          style={{ backgroundColor: '#2b2d31' }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 border-b border-white/10 flex items-center gap-3"
            style={{ backgroundColor: '#1e1f22' }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#CC0000' }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">System Updates</p>
              <p className="text-[11px] text-gray-500">Patch notes & release history</p>
            </div>
            <span
              className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#CC0000', color: 'white' }}
            >
              LIVE
            </span>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {UPDATES.map((release) => (
              <div key={release.version}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: '#383a40', color: '#CC0000' }}
                  >
                    {release.version}
                  </span>
                  <span className="text-[11px] text-gray-500">{release.date}</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                </div>
                <ul className="space-y-1.5">
                  {release.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#CC0000' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-white/5 flex items-center justify-between"
            style={{ backgroundColor: '#1e1f22' }}
          >
            <span className="text-[10px] text-gray-600">ConsultSiya © 2026 Mapúa University SOIT</span>
            <span className="text-[10px] text-gray-600">Build 2026.05</span>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
