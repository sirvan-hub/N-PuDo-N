import { FormEvent, useState } from 'react';

type UserRole = 'COURIER' | 'HUB_OWNER' | 'RECIPIENT' | 'ADMIN' | 'SUPER_ADMIN' | string;
type AuthUser = { sub?: string; id?: string; phone?: string; role: UserRole; is_verified?: boolean };
type AuthResponse = { access_token: string; user: AuthUser };

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');

const roleInfo: Record<string, { title: string; short: string; description: string; icon: string }> = {
  COURIER: { title: 'پنل سفیر', short: 'سفیر', description: 'ثبت بسته، انتخاب هاب و پیگیری تحویل', icon: '↗' },
  HUB_OWNER: { title: 'پنل هاب', short: 'مالک هاب', description: 'دریافت بسته، مدیریت موجودی و تحویل به مشتری', icon: '⌂' },
  RECIPIENT: { title: 'پنل مشتری', short: 'مشتری', description: 'مشاهده وضعیت بسته و پیگیری دریافت', icon: '□' },
  ADMIN: { title: 'پنل مدیر سیستم', short: 'مدیر سیستم', description: 'نمای کلی عملیات و دسترسی‌های مدیریتی', icon: '◇' },
};

function getApiError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join('، ');
  }
  return fallback;
}

export default function App() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState<{ token: string; user: AuthUser } | null>(null);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!apiBase) {
      setError('آدرس API هنوز تنظیم نشده است. پس از آماده‌شدن سرویس سازگار، مقدار VITE_API_BASE_URL را در تنظیمات انتشار وارد کنید.');
      return;
    }
    if (!/^09\d{9}$/.test(phone)) {
      setError('شماره موبایل باید با 09 شروع شود و ۱۱ رقم داشته باشد.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, `درخواست ورود ناموفق بود (HTTP ${response.status}).`));
      setStep('otp');
      setNotice('درخواست کد تأیید ثبت شد. کد را از مسیر رسمی دریافت‌شده وارد کنید.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ارتباط با سرور برقرار نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!apiBase) return setError('آدرس API تنظیم نشده است.');
    if (!/^\d{5}$/.test(otp)) return setError('کد تأیید باید ۵ رقم باشد.');
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, `تأیید ورود ناموفق بود (HTTP ${response.status}).`));
      const result = body as Partial<AuthResponse>;
      if (!result.access_token || !result.user?.role) {
        throw new Error('پاسخ سرور با قرارداد احراز هویت Pudo-N مطابقت ندارد.');
      }
      setSession({ token: result.access_token, user: result.user });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ارتباط با سرور برقرار نشد.');
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setSession(null);
    setPhone('');
    setOtp('');
    setStep('phone');
    setError('');
    setNotice('');
  }

  const normalizedRole = session?.user.role === 'SUPER_ADMIN' ? 'ADMIN' : session?.user.role;
  const role = normalizedRole ? roleInfo[normalizedRole] : undefined;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="صفحه اصلی Pudo-N">
          <span className="brand-mark">P</span>
          <span><strong>Pudo-N</strong><small>توزیع هوشمند محله‌ای</small></span>
        </a>
        <span className="secure-label"><span className="status-dot" /> درگاه کاربران</span>
      </header>

      {!session ? (
        <section className="login-layout">
          <div className="intro-panel">
            <span className="eyebrow">NEIGHBORHOOD DELIVERY</span>
            <h1>تحویل نزدیک‌تر،<br /><em>آسان‌تر و مطمئن‌تر.</em></h1>
            <p>به شبکه توزیع محله‌ای Pudo-N خوش آمدید. پس از ورود، پنل متناسب با نقش حساب شما نمایش داده می‌شود.</p>
            <div className="mini-flow" aria-label="مسیر توزیع بسته">
              <div><span>۱</span><strong>سفیر</strong><small>ثبت و انتقال</small></div>
              <i>←</i>
              <div><span>۲</span><strong>هاب محله</strong><small>دریافت و نگهداری</small></div>
              <i>←</i>
              <div><span>۳</span><strong>مشتری</strong><small>دریافت بسته</small></div>
            </div>
          </div>
          <div className="login-card">
            <div className="card-symbol">↗</div>
            <h2>{step === 'phone' ? 'ورود به حساب' : 'تأیید شماره موبایل'}</h2>
            <p className="muted">{step === 'phone' ? 'شماره موبایل ثبت‌شده خود را وارد کنید.' : `کد تأیید پنج‌رقمی را برای شماره ${phone} وارد کنید.`}</p>
            {step === 'phone' ? (
              <form onSubmit={requestOtp}>
                <label htmlFor="phone">شماره موبایل</label>
                <input id="phone" inputMode="tel" autoComplete="tel-national" dir="ltr" placeholder="09123456789" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\s/g, ''))} maxLength={11} required />
                <button className="primary-button" type="submit" disabled={busy}>{busy ? 'در حال ارسال…' : 'دریافت کد ورود'} <span>←</span></button>
              </form>
            ) : (
              <form onSubmit={verifyOtp}>
                <label htmlFor="otp">کد تأیید</label>
                <input id="otp" inputMode="numeric" autoComplete="one-time-code" dir="ltr" placeholder="•••••" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 5))} maxLength={5} required />
                <button className="primary-button" type="submit" disabled={busy}>{busy ? 'در حال بررسی…' : 'تأیید و ورود'} <span>←</span></button>
                <button className="text-button" type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); setNotice(''); }}>اصلاح شماره موبایل</button>
              </form>
            )}
            {error && <p className="feedback error" role="alert">{error}</p>}
            {notice && <p className="feedback notice" role="status">{notice}</p>}
            <div className="card-foot"><span className="lock">▣</span> اطلاعات ورود فقط به API تنظیم‌شده ارسال می‌شود.</div>
          </div>
        </section>
      ) : (
        <section className="dashboard">
          <div className="welcome-row">
            <div><span className="eyebrow">WORKSPACE</span><h1>خوش آمدید</h1><p className="muted">حساب شما با موفقیت احراز هویت شد.</p></div>
            <button className="outline-button" onClick={signOut}>خروج از حساب</button>
          </div>
          <div className="user-strip"><span className="avatar">{(role?.short ?? 'کاربر').slice(0, 1)}</span><div><strong>{role?.title ?? 'نقش تعریف‌نشده'}</strong><small dir="ltr">{session.user.phone ?? phone}</small></div><span className="role-pill">{role?.short ?? session.user.role}</span></div>
          <h2 className="section-heading">پنل کاری شما</h2>
          <div className="panel-grid">
            {Object.entries(roleInfo).map(([key, item]) => {
              const active = key === normalizedRole;
              return <article className={`panel-card ${active ? 'active' : 'locked'}`} key={key}>
                <div className="panel-icon">{item.icon}</div><span className="panel-status">{active ? 'پنل شما' : 'دسترسی محدود'}</span>
                <h3>{item.title}</h3><p>{item.description}</p>
                {active ? <strong className="active-link">پنل انتخاب‌شده <span>←</span></strong> : <span className="disabled-link">نیازمند مجوز این نقش</span>}
              </article>;
            })}
          </div>
          <p className="integration-note">این نسخه، پوسته اولیه پنل‌هاست. قابلیت‌های عملیاتی پس از نهایی‌شدن قرارداد API و مجوزهای سرور به‌صورت مرحله‌ای متصل می‌شوند.</p>
        </section>
      )}
      <footer className="footer"><span>© Pudo-N</span><span>سامانه توزیع محله‌ای</span><span>نسخه آغازین PWA</span></footer>
    </main>
  );
}