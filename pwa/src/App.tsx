import { FormEvent, useEffect, useState } from 'react';

type UserRole = 'COURIER' | 'HUB_OWNER' | 'RECIPIENT' | 'ADMIN' | 'SUPER_ADMIN' | string;
type AuthUser = { sub?: string; id?: string; username?: string; phone?: string; role: UserRole; is_verified?: boolean };
type AuthResponse = { access_token: string; user: AuthUser };
type AppNotification = { id: string; category: string; title: string; body: string; reference_type?: string | null; reference_id?: string | null; expires_at?: string | null; read_at?: string | null; created_at: string };

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
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [session, setSession] = useState<{ token: string; user: AuthUser } | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationError, setNotificationError] = useState('');
  const [notificationsLoading, setNotificationsLoading] = useState(false);\n  const [invitationPhone, setInvitationPhone] = useState('');\n  const [workspaceBusy, setWorkspaceBusy] = useState(false);\n  const [workspaceMessage, setWorkspaceMessage] = useState('');

  useEffect(() => {
    if (!session || !apiBase) {
      setNotifications([]);
      setNotificationError('');
      setNotificationsLoading(false);
      return;
    }
    let cancelled = false;
    let firstLoad = true;
    setNotificationsLoading(true);
    setNotificationError('');

    const loadNotifications = async () => {
      try {
        const response = await fetch(`${apiBase}/notifications`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const body: unknown = await response.json().catch(() => []);
        if (!response.ok) throw new Error(getApiError(body, `دریافت پیام‌ها ناموفق بود (HTTP ${response.status}).`));
        if (!Array.isArray(body)) throw new Error('ساختار پاسخ صندوق پیام معتبر نیست.');
        if (!cancelled) {
          setNotifications(body as AppNotification[]);
          setNotificationError('');
        }
      } catch (cause) {
        if (!cancelled) setNotificationError(cause instanceof Error ? cause.message : 'دریافت پیام‌ها ناموفق بود.');
      } finally {
        if (!cancelled && firstLoad) {
          firstLoad = false;
          setNotificationsLoading(false);
        }
      }
    };

    void loadNotifications();
    const refreshTimer = setInterval(() => { void loadNotifications(); }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [session]);

  async function markNotificationRead(notificationId: string) {
    if (!session || !apiBase) return;
    setNotificationError('');
    try {
      const response = await fetch(`${apiBase}/notifications/${encodeURIComponent(notificationId)}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, `ثبت خواندن پیام ناموفق بود (HTTP ${response.status}).`));
      setNotifications((items) => items.map((item) => item.id === notificationId
        ? { ...item, read_at: new Date().toISOString() }
        : item));
    } catch (cause) {
      setNotificationError(cause instanceof Error ? cause.message : 'ثبت خواندن پیام ناموفق بود.');
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError('');
    setNotice('');
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!apiBase) {
      setError('آدرس API تنظیم نشده است. مقدار VITE_API_BASE_URL باید به آدرس بک‌اند و مسیر /v1 اشاره کند.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
      setError('نام کاربری باید ۳ تا ۳۲ حرف انگلیسی، عدد یا یکی از . _ - باشد.');
      return;
    }
    if (password.length < 10 || password.length > 72) {
      setError('رمز عبور باید بین ۱۰ تا ۷۲ کاراکتر باشد.');
      return;
    }
    if (mode === 'register' && !/^09\d{9}$/.test(phone)) {
      setError('شماره موبایل باید با 09 شروع شود و ۱۱ رقم داشته باشد.');
      return;
    }

    setBusy(true);
    try {
      const isRegister = mode === 'register';
      const response = await fetch(`${apiBase}/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister
          ? { username, password, phone, full_name: fullName.trim() || undefined }
          : { username, password }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, `درخواست ناموفق بود (HTTP ${response.status}).`));

      if (isRegister) {
        setMode('login');
        setPassword('');
        setNotice('حساب مشتری ساخته شد. اکنون با نام کاربری و رمز عبور وارد شوید.');
        return;
      }

      const result = body as Partial<AuthResponse>;
      if (!result.access_token || !result.user?.role) {
        throw new Error('پاسخ سرور با قرارداد ورود Pudo-N مطابقت ندارد.');
      }
      setSession({ token: result.access_token, user: result.user });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ارتباط با سرور برقرار نشد.');
    } finally {
      setBusy(false);
    }
  }

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !apiBase) return;
    setWorkspaceBusy(true);
    setWorkspaceMessage('');
    setError('');
    try {
      const response = await fetch(`${apiBase}/parcels/invitations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_phone: invitationPhone.trim() }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, `ارسال دعوت ناموفق بود (HTTP ${response.status}).`));
      setInvitationPhone('');
      setWorkspaceMessage('دعوت برای گیرنده ارسال شد. تا تأیید او، ثبت رسمی مرسوله انجام نمی‌شود.');
    } catch (cause) {
      setWorkspaceMessage(cause instanceof Error ? cause.message : 'ارسال دعوت ناموفق بود.');
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function respondToInvitation(notification: AppNotification, accepted: boolean) {
    if (!session || !apiBase || !notification.reference_id) return;
    setWorkspaceBusy(true);
    setWorkspaceMessage('');
    try {
      const response = await fetch(`${apiBase}/parcels/invitations/${encodeURIComponent(notification.reference_id)}/respond`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, `ثبت پاسخ دعوت ناموفق بود (HTTP ${response.status}).`));
      setNotifications((items) => items.map((item) => item.id === notification.id
        ? { ...item, read_at: new Date().toISOString() }
        : item));
      setWorkspaceMessage(accepted
        ? 'دعوت تأیید شد. سفیر اکنون مجاز است اطلاعات مرسوله را ثبت کند.'
        : 'دعوت رد شد. مرسوله نباید در شبکه Pudo-N ثبت شود.');
    } catch (cause) {
      setWorkspaceMessage(cause instanceof Error ? cause.message : 'ثبت پاسخ دعوت ناموفق بود.');
    } finally {
      setWorkspaceBusy(false);
    }
  }

  function signOut() {
    setSession(null);
    setUsername('');
    setPassword('');
    setPhone('');
    setFullName('');
    setError('');
    setNotice('');
    setNotifications([]);
    setNotificationError('');
    setMode('login');
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
        <span className="secure-label"><span className="status-dot" /> ورود با نام کاربری</span>
      </header>

      {!session ? (
        <section className="login-layout">
          <div className="intro-panel">
            <span className="eyebrow">NEIGHBORHOOD DELIVERY</span>
            <h1>تحویل نزدیک‌تر،<br /><em>آسان‌تر و مطمئن‌تر.</em></h1>
            <p>به شبکه توزیع محله‌ای Pudo-N خوش آمدید. فعلاً ورود با نام کاربری و رمز عبور فعال است؛ پس از آماده‌شدن سرویس پیامک، روش ورود به OTP تغییر می‌کند.</p>
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
            <h2>{mode === 'login' ? 'ورود به حساب' : 'ساخت حساب مشتری'}</h2>
            <p className="muted">{mode === 'login' ? 'نام کاربری و رمز عبور خود را وارد کنید.' : 'ثبت‌نام عمومی فعلاً فقط برای حساب مشتری فعال است.'}</p>
            <div className="auth-tabs" role="tablist" aria-label="نوع ورود">
              <button type="button" className={mode === 'login' ? 'auth-tab selected' : 'auth-tab'} onClick={() => switchMode('login')}>ورود</button>
              <button type="button" className={mode === 'register' ? 'auth-tab selected' : 'auth-tab'} onClick={() => switchMode('register')}>ثبت‌نام مشتری</button>
            </div>
            <form onSubmit={submitAuth}>
              <label htmlFor="username">نام کاربری</label>
              <input id="username" autoComplete="username" dir="ltr" placeholder="your.username" value={username} onChange={(event) => setUsername(event.target.value.trim())} maxLength={32} required />
              {mode === 'register' && <>
                <label htmlFor="phone">شماره موبایل</label>
                <input id="phone" inputMode="tel" autoComplete="tel-national" dir="ltr" placeholder="09123456789" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\s/g, ''))} maxLength={11} required />
                <label htmlFor="fullName">نام و نام خانوادگی (اختیاری)</label>
                <input id="fullName" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={100} />
              </>}
              <label htmlFor="password">رمز عبور</label>
              <input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" placeholder="حداقل ۱۰ کاراکتر" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} maxLength={72} required />
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'در حال بررسی…' : mode === 'login' ? 'ورود به پنل' : 'ساخت حساب'} <span>←</span></button>
            </form>
            {error && <p className="feedback error" role="alert">{error}</p>}
            {notice && <p className="feedback notice" role="status">{notice}</p>}
            <div className="card-foot"><span className="lock">▣</span> رمز عبور به‌صورت هش‌شده در سرور ذخیره می‌شود.</div>
          </div>
        </section>
      ) : (
        <section className="dashboard">
          <div className="welcome-row">
            <div><span className="eyebrow">WORKSPACE</span><h1>خوش آمدید</h1><p className="muted">حساب شما با موفقیت احراز هویت شد.</p></div>
            <button className="outline-button" onClick={signOut}>خروج از حساب</button>
          </div>
          <div className="user-strip"><span className="avatar">{(role?.short ?? 'کاربر').slice(0, 1)}</span><div><strong>{role?.title ?? 'نقش تعریف‌نشده'}</strong><small dir="ltr">{session.user.username ?? username} · {session.user.phone ?? phone}</small></div><span className="role-pill">{role?.short ?? session.user.role}</span></div>
          <section className="notification-section" aria-labelledby="notifications-heading">
            <div className="notification-heading">
              <div><span className="eyebrow">INBOX</span><h2 id="notifications-heading">صندوق پیام‌های شما</h2></div>
              <span className="notification-count">{notifications.filter((item) => !item.read_at).length} خوانده‌نشده</span>
            </div>
            {notificationsLoading && <p className="muted">در حال دریافت پیام‌ها…</p>}
            {notificationError && <p className="feedback error" role="alert">{notificationError}</p>}
            {!notificationsLoading && !notificationError && notifications.length === 0 && <p className="notification-empty">پیامی برای نمایش وجود ندارد.</p>}
            {notifications.length > 0 && <div className="notification-list">
              {notifications.map((item) => (
                <article className={`notification-card ${item.read_at ? 'read' : 'unread'}`} key={item.id}>
                  <div className="notification-card-top"><strong>{item.title}</strong><time>{new Date(item.created_at).toLocaleString('fa-IR')}</time></div>
                  <p>{item.body}</p>
                  {item.expires_at && <small className="notification-expiry">اعتبار تا {new Date(item.expires_at).toLocaleTimeString('fa-IR')}</small>}
                  {item.category === 'PARCEL_INVITATION' && item.reference_id && !item.read_at && normalizedRole === 'RECIPIENT' && (
                    <div className="invitation-actions">
                      <button className="primary-button" type="button" disabled={workspaceBusy} onClick={() => void respondToInvitation(item, true)}>تأیید دعوت</button>
                      <button className="outline-button" type="button" disabled={workspaceBusy} onClick={() => void respondToInvitation(item, false)}>رد دعوت</button>
                    </div>
                  )}
                  {!item.read_at && <button className="text-button" type="button" onClick={() => void markNotificationRead(item.id)}>علامت‌گذاری به‌عنوان خوانده‌شده</button>}
                </article>
              ))}
            </div>}
          </section>
          {normalizedRole === 'COURIER' && (
            <section className="workflow-card" aria-labelledby="invite-heading">
              <span className="eyebrow">RECIPIENT CONSENT</span>
              <h2 id="invite-heading">دعوت گیرنده پیش از ثبت مرسوله</h2>
              <p className="muted">شماره گیرنده ثبت‌شده را وارد کنید. تا زمانی که گیرنده دعوت را تأیید نکند، ثبت رسمی مرسوله مجاز نیست.</p>
              <form onSubmit={submitInvitation} className="invitation-form">
                <label htmlFor="invitationPhone">شماره موبایل گیرنده</label>
                <input id="invitationPhone" inputMode="tel" dir="ltr" placeholder="09123456789" value={invitationPhone} onChange={(event) => setInvitationPhone(event.target.value.replace(/\s/g, ''))} pattern="\+?\d{8,15}" required />
                <button className="primary-button" type="submit" disabled={workspaceBusy}>{workspaceBusy ? 'در حال ارسال…' : 'ارسال دعوت به مشتری'}</button>
              </form>
              {workspaceMessage && <p className="feedback notice" role="status">{workspaceMessage}</p>}
            </section>
          )}
          {normalizedRole === 'RECIPIENT' && workspaceMessage && <p className="feedback notice" role="status">{workspaceMessage}</p>}
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
