import { FormEvent, useEffect, useState } from 'react';

type UserRole = 'COURIER' | 'HUB_OWNER' | 'RECIPIENT' | 'ADMIN' | 'SUPER_ADMIN' | string;
type AuthUser = { sub?: string; id?: string; username?: string; phone?: string; role: UserRole; is_verified?: boolean };
type AuthResponse = { access_token: string; user: AuthUser };
type AppNotification = { id: string; category: string; title: string; body: string; reference_type?: string | null; reference_id?: string | null; expires_at?: string | null; read_at?: string | null; created_at: string };
type PayoutRequest = { requestId: string; amount: number; status: string; createdAt?: string; reviewedAt?: string | null; reviewNote?: string | null; transferReference?: string | null };
type PayoutQueueItem = PayoutRequest & { beneficiaryType?: 'COURIER' | 'HUB'; courierId?: string | null; hubId?: string | null; requestedBy?: string | null };

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
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [invitationPhone, setInvitationPhone] = useState('');
  const [invitationId, setInvitationId] = useState('');
  const [trackingCode, setTrackingCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [postalPostageAmount, setPostalPostageAmount] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [packageSize, setPackageSize] = useState<'SMALL' | 'MEDIUM' | 'LARGE'>('MEDIUM');
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [draftParcelId, setDraftParcelId] = useState('');

  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState('');
  const [payoutFrequency, setPayoutFrequency] = useState<'WEEKLY' | 'MONTHLY'>('MONTHLY');
  const [payoutDestinationToken, setPayoutDestinationToken] = useState('');
  const [payoutDestinationLast4, setPayoutDestinationLast4] = useState('');
  const [payoutDestinationVerified, setPayoutDestinationVerified] = useState(false);
  const [payoutDestinationConfigured, setPayoutDestinationConfigured] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutHubId, setPayoutHubId] = useState('');
  const [payoutHistory, setPayoutHistory] = useState<PayoutRequest[]>([]);
  const [payoutMessage, setPayoutMessage] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [adminPayoutQueue, setAdminPayoutQueue] = useState<PayoutQueueItem[]>([]);
  const [payoutTransferReferences, setPayoutTransferReferences] = useState<Record<string, string>>({});
  const [payoutTransferFailureReasons, setPayoutTransferFailureReasons] = useState<Record<string, string>>({});
  const [destinationVerifyUserId, setDestinationVerifyUserId] = useState('');
  const [destinationVerificationReference, setDestinationVerificationReference] = useState('');

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


  useEffect(() => {
    if (!session || !apiBase || !['COURIER', 'HUB_OWNER'].includes(session.user.role)) return;
    let cancelled = false;
    const loadPreference = async () => {
      try {
        const response = await fetch(`${apiBase}/settlements/me/payout-preference`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(getApiError(body, 'دریافت تنظیمات تسویه ناموفق بود.'));
        const data = body as { frequency?: 'WEEKLY' | 'MONTHLY'; destinationVerified?: boolean; destinationConfigured?: boolean; destinationLast4?: string | null };
        if (cancelled) return;
        setPayoutFrequency(data.frequency === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY');
        setPayoutDestinationVerified(Boolean(data.destinationVerified));
        setPayoutDestinationConfigured(Boolean(data.destinationConfigured));
        setPayoutDestinationLast4(data.destinationLast4 ?? '');
      } catch (cause) {
        if (!cancelled) setPayoutError(cause instanceof Error ? cause.message : 'دریافت تنظیمات تسویه ناموفق بود.');
      }
    };
    const loadCourierHistory = async () => {
      if (session.user.role !== 'COURIER') return;
      try {
        const response = await fetch(`${apiBase}/settlements/couriers/me/payout-requests`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(getApiError(body, 'دریافت تاریخچه تسویه ناموفق بود.'));
        if (!cancelled && Array.isArray(body)) setPayoutHistory(body as PayoutRequest[]);
      } catch (cause) {
        if (!cancelled) setPayoutError(cause instanceof Error ? cause.message : 'دریافت تاریخچه تسویه ناموفق بود.');
      }
    };
    void loadPreference();
    void loadCourierHistory();
    return () => { cancelled = true; };
  }, [session]);

  async function savePayoutPreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !apiBase) return;
    setPayoutLoading(true);
    setPayoutError('');
    setPayoutMessage('');
    try {
      const body: Record<string, unknown> = { frequency: payoutFrequency };
      if (payoutDestinationToken.trim()) {
        if (!payoutDestinationToken.trim() || !/^\d{4}$/.test(payoutDestinationLast4.trim())) {
          throw new Error('برای تنظیم مقصد، شناسه مرجع و چهار رقم پایانی را کامل وارد کنید.');
        }
        body.destinationToken = payoutDestinationToken.trim();
        body.destinationLast4 = payoutDestinationLast4.trim();
      }
      const response = await fetch(`${apiBase}/settlements/me/payout-preference`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(result, 'ذخیره تنظیمات تسویه ناموفق بود.'));
      const data = result as { destinationVerified?: boolean; destinationConfigured?: boolean; destinationLast4?: string | null };
      setPayoutDestinationVerified(Boolean(data.destinationVerified));
      setPayoutDestinationConfigured(Boolean(data.destinationConfigured));
      setPayoutDestinationLast4(data.destinationLast4 ?? '');
      setPayoutDestinationToken('');
      setPayoutMessage('تنظیمات تسویه ذخیره شد. تغییر مقصد، تأیید قبلی را باطل می‌کند.');
    } catch (cause) {
      setPayoutError(cause instanceof Error ? cause.message : 'ذخیره تنظیمات تسویه ناموفق بود.');
    } finally {
      setPayoutLoading(false);
    }
  }

  async function loadPayoutHistory() {
    if (!session || !apiBase) return;
    const courier = session.user.role === 'COURIER';
    if (!courier && !payoutHubId.trim()) {
      setPayoutError('برای مشاهده تاریخچه هاب، شناسه هاب را وارد کنید.');
      return;
    }
    setPayoutLoading(true);
    setPayoutError('');
    try {
      const requestPath = courier
        ? '/settlements/couriers/me/payout-requests'
        : `/settlements/hubs/${encodeURIComponent(payoutHubId.trim())}/payout-requests`;
      const response = await fetch(`${apiBase}${requestPath}`, { headers: { Authorization: `Bearer ${session.token}` } });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, 'دریافت تاریخچه تسویه ناموفق بود.'));
      if (!Array.isArray(body)) throw new Error('ساختار تاریخچه تسویه معتبر نیست.');
      setPayoutHistory(body as PayoutRequest[]);
    } catch (cause) {
      setPayoutError(cause instanceof Error ? cause.message : 'دریافت تاریخچه تسویه ناموفق بود.');
    } finally {
      setPayoutLoading(false);
    }
  }

  async function requestPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !apiBase) return;
    if (!payoutDestinationVerified) {
      setPayoutError('تا زمانی که مدیر سیستم مقصد تسویه را بررسی و تأیید نکرده باشد، درخواست تسویه مجاز نیست.');
      return;
    }
    const amount = Number(payoutAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) {
      setPayoutError('مبلغ تسویه باید عدد صحیح مثبت و به تومان باشد.');
      return;
    }
    const courier = session.user.role === 'COURIER';
    if (!courier && !payoutHubId.trim()) {
      setPayoutError('برای درخواست تسویه هاب، شناسه هاب را وارد کنید.');
      return;
    }
    setPayoutLoading(true);
    setPayoutError('');
    setPayoutMessage('');
    try {
      const requestPath = courier
        ? '/settlements/couriers/me/payout-requests'
        : `/settlements/hubs/${encodeURIComponent(payoutHubId.trim())}/payout-requests`;
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `payout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetch(`${apiBase}${requestPath}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ amount }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, 'ثبت درخواست تسویه ناموفق بود.'));
      setPayoutAmount('');
      setPayoutMessage('درخواست ثبت شد و مبلغ از موجودی قابل‌برداشت به موجودی مسدودشده منتقل شد. این ثبت به‌معنای انتقال بانکی نیست.');
      await loadPayoutHistory();
    } catch (cause) {
      setPayoutError(cause instanceof Error ? cause.message : 'ثبت درخواست تسویه ناموفق بود.');
    } finally {
      setPayoutLoading(false);
    }
  }


  useEffect(() => {
    if (!session || !apiBase || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      setAdminPayoutQueue([]);
      return;
    }
    let cancelled = false;
    const loadQueue = async () => {
      try {
        const response = await fetch(apiBase + '/settlements/payout-requests', {
          headers: { Authorization: 'Bearer ' + session.token },
        });
        const body: unknown = await response.json().catch(() => []);
        if (!response.ok) throw new Error(getApiError(body, 'دریافت صف تسویه ناموفق بود.'));
        if (!Array.isArray(body)) throw new Error('ساختار صف تسویه معتبر نیست.');
        if (!cancelled) setAdminPayoutQueue(body as PayoutQueueItem[]);
      } catch (cause) {
        if (!cancelled) setPayoutError(cause instanceof Error ? cause.message : 'دریافت صف تسویه ناموفق بود.');
      }
    };
    void loadQueue();
    return () => { cancelled = true; };
  }, [session]);

  async function verifyPayoutDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !apiBase) return;
    if (!destinationVerifyUserId.trim() || !destinationVerificationReference.trim()) {
      setPayoutError('شناسه کاربر و مرجع بررسی خارجی را وارد کنید.');
      return;
    }
    setPayoutLoading(true);
    setPayoutError('');
    setPayoutMessage('');
    try {
      const response = await fetch(apiBase + '/settlements/payout-profiles/' + encodeURIComponent(destinationVerifyUserId.trim()) + '/verify-destination', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationReference: destinationVerificationReference.trim() }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, 'ثبت تأیید مقصد تسویه ناموفق بود.'));
      setDestinationVerifyUserId('');
      setDestinationVerificationReference('');
      setPayoutMessage('تأیید دستی مقصد ثبت شد؛ این عملیات استعلام خودکار بانک نیست.');
    } catch (cause) {
      setPayoutError(cause instanceof Error ? cause.message : 'ثبت تأیید مقصد تسویه ناموفق بود.');
    } finally {
      setPayoutLoading(false);
    }
  }

  async function recordPayoutTransferResult(requestId: string, outcome: 'COMPLETED' | 'FAILED') {
    if (!session || !apiBase) return;
    const transferReference = (payoutTransferReferences[requestId] ?? '').trim();
    const failureReason = (payoutTransferFailureReasons[requestId] ?? '').trim();
    if (!transferReference) {
      setPayoutError('برای ثبت نتیجه انتقال، مرجع خارجی تأییدشده را وارد کنید.');
      return;
    }
    if (outcome === 'FAILED' && !failureReason) {
      setPayoutError('برای انتقال ناموفق، علت شکست را نیز وارد کنید.');
      return;
    }
    setPayoutLoading(true);
    setPayoutError('');
    setPayoutMessage('');
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? ('payout-result-' + Date.now() + '-' + Math.random().toString(16).slice(2));
      const response = await fetch(apiBase + '/settlements/payout-requests/' + encodeURIComponent(requestId) + '/transfer-result', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ outcome, transferReference, ...(outcome === 'FAILED' ? { failureReason } : {}) }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, 'ثبت نتیجه انتقال ناموفق بود.'));
      setPayoutMessage(outcome === 'COMPLETED'
        ? 'نتیجه انتقال خارجی با مرجع ثبت شد؛ موجودی رزروشده تسویه شد.'
        : 'شکست انتقال با مرجع ثبت شد و مبلغ به موجودی قابل استفاده برگشت.');
      setPayoutTransferReferences((previous) => ({ ...previous, [requestId]: '' }));
      setPayoutTransferFailureReasons((previous) => ({ ...previous, [requestId]: '' }));
      const queueResponse = await fetch(apiBase + '/settlements/payout-requests', {
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const queueBody: unknown = await queueResponse.json().catch(() => []);
      if (queueResponse.ok && Array.isArray(queueBody)) setAdminPayoutQueue(queueBody as PayoutQueueItem[]);
    } catch (cause) {
      setPayoutError(cause instanceof Error ? cause.message : 'ثبت نتیجه انتقال ناموفق بود.');
    } finally {
      setPayoutLoading(false);
    }
  }

  async function reviewPayoutRequest(requestId: string, decision: 'APPROVE' | 'REJECT') {
    if (!session || !apiBase) return;
    setPayoutLoading(true);
    setPayoutError('');
    setPayoutMessage('');
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? ('payout-review-' + Date.now() + '-' + Math.random().toString(16).slice(2));
      const response = await fetch(apiBase + '/settlements/payout-requests/' + encodeURIComponent(requestId) + '/review', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ decision, note: decision === 'APPROVE' ? 'Approved after administrator review; no bank transfer executed.' : 'Rejected by administrator review.' }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, 'بررسی درخواست تسویه ناموفق بود.'));
      setPayoutMessage(decision === 'APPROVE' ? 'درخواست تأیید شد؛ انتقال بانکی اجرا نشده است.' : 'درخواست رد شد و مبلغ رزروشده برگشت.');
      const queueResponse = await fetch(apiBase + '/settlements/payout-requests', {
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const queueBody: unknown = await queueResponse.json().catch(() => []);
      if (queueResponse.ok && Array.isArray(queueBody)) setAdminPayoutQueue(queueBody as PayoutQueueItem[]);
    } catch (cause) {
      setPayoutError(cause instanceof Error ? cause.message : 'بررسی درخواست تسویه ناموفق بود.');
    } finally {
      setPayoutLoading(false);
    }
  }

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

  async function uploadAndAttachLabel(parcelId: string, file: File) {
    if (!session || !apiBase) throw new Error('نشست کاربری یا آدرس API معتبر نیست.');
    const form = new FormData();
    form.append('file', file);
    form.append('category', 'LABEL_IMAGE');
    const uploadResponse = await fetch(`${apiBase}/evidence/parcels/${encodeURIComponent(parcelId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}` },
      body: form,
    });
    const uploadBody: unknown = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) throw new Error(getApiError(uploadBody, `بارگذاری تصویر لیبل ناموفق بود (HTTP ${uploadResponse.status}).`));
    const evidenceRef = uploadBody && typeof uploadBody === 'object' && 'evidence_ref' in uploadBody
      ? (uploadBody as { evidence_ref?: unknown }).evidence_ref
      : null;
    if (typeof evidenceRef !== 'string' || !evidenceRef.startsWith(`pudo-evidence://parcels/${parcelId}/label_image/`)) {
      throw new Error('پاسخ بارگذاری تصویر لیبل معتبر نیست.');
    }
    const attachResponse = await fetch(`${apiBase}/parcels/${encodeURIComponent(parcelId)}/label-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence_ref: evidenceRef }),
    });
    const attachBody: unknown = await attachResponse.json().catch(() => ({}));
    if (!attachResponse.ok) throw new Error(getApiError(attachBody, `اتصال تصویر لیبل به مرسوله ناموفق بود (HTTP ${attachResponse.status}).`));
  }

  async function submitParcelRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !apiBase) return;
    if (!labelFile) {
      setWorkspaceMessage('برای ثبت مرسوله، انتخاب تصویر لیبل پستی الزامی است.');
      return;
    }
    if (!Number.isSafeInteger(Number(postalPostageAmount)) || Number(postalPostageAmount) < 0) {
      setWorkspaceMessage('کرایه واقعی درج‌شده روی لیبل باید عدد صحیح نامنفی باشد.');
      return;
    }
    setWorkspaceBusy(true);
    setWorkspaceMessage('');
    try {
      const response = await fetch(`${apiBase}/parcels`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitation_id: invitationId.trim(),
          tracking_code: trackingCode.trim(),
          barcode: barcode.trim(),
          postal_postage_amount: Number(postalPostageAmount),
          sender_name: senderName.trim(),
          sender_phone: senderPhone.trim(),
          recipient_phone: recipientPhone.trim(),
          recipient_name: recipientName.trim(),
          recipient_address: recipientAddress.trim(),
          package_size: packageSize,
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(body, `ثبت پیش‌نویس مرسوله ناموفق بود (HTTP ${response.status}).`));
      const parcelId = body && typeof body === 'object' && 'id' in body ? (body as { id?: unknown }).id : null;
      if (typeof parcelId !== 'string' || !parcelId) throw new Error('مرسوله ایجاد شد اما شناسه معتبر در پاسخ سرور نبود.');
      setDraftParcelId(parcelId);
      await uploadAndAttachLabel(parcelId, labelFile);
      setDraftParcelId('');
      setLabelFile(null);
      setWorkspaceMessage(`مرسوله ${parcelId} ثبت شد و تصویر لیبل خصوصی آن متصل شد. انتخاب هاب تا تأیید پرداخت هزینه ورود امکان‌پذیر نیست.`);
    } catch (cause) {
      setWorkspaceMessage(cause instanceof Error ? cause.message : 'ثبت مرسوله یا بارگذاری تصویر لیبل ناموفق بود.');
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function retryLabelAttachment() {
    if (!draftParcelId || !labelFile) return;
    setWorkspaceBusy(true);
    setWorkspaceMessage('');
    try {
      await uploadAndAttachLabel(draftParcelId, labelFile);
      const completedId = draftParcelId;
      setDraftParcelId('');
      setLabelFile(null);
      setWorkspaceMessage(`تصویر لیبل به مرسوله ${completedId} متصل شد. انتخاب هاب تا تأیید پرداخت هزینه ورود امکان‌پذیر نیست.`);
    } catch (cause) {
      setWorkspaceMessage(cause instanceof Error ? cause.message : 'اتصال تصویر لیبل ناموفق بود.');
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
                  {item.category === 'PARCEL_INVITATION_RESPONSE' && item.reference_id && normalizedRole === 'COURIER' && (
                    <small className="notification-expiry">شناسه دعوت برای ثبت مرسوله: <bdi dir="ltr">{item.reference_id}</bdi></small>
                  )}
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
          {normalizedRole === 'COURIER' && (
            <section className="workflow-card" aria-labelledby="parcel-register-heading">
              <span className="eyebrow">PARCEL REGISTRATION</span>
              <h2 id="parcel-register-heading">ثبت مرسوله و تصویر لیبل</h2>
              <p className="muted">ابتدا شناسه دعوت تأییدشده را از پیام پاسخ مشتری وارد کنید. کرایه پستی باید دقیقاً از لیبل خوانده شود؛ تصویر لیبل را انتخاب کنید تا پس از ایجاد پیش‌نویس بارگذاری و به‌صورت خصوصی متصل شود.</p>
              <form onSubmit={submitParcelRegistration} className="invitation-form">
                <label htmlFor="acceptedInvitationId">شناسه دعوت تأییدشده</label>
                <input id="acceptedInvitationId" dir="ltr" value={invitationId} onChange={(event) => setInvitationId(event.target.value.trim())} required />
                <label htmlFor="trackingCode">کد رهگیری</label>
                <input id="trackingCode" dir="ltr" value={trackingCode} onChange={(event) => setTrackingCode(event.target.value.trim())} maxLength={120} required />
                <label htmlFor="barcode">بارکد روی لیبل</label>
                <input id="barcode" dir="ltr" value={barcode} onChange={(event) => setBarcode(event.target.value.trim())} maxLength={120} required />
                <label htmlFor="postalPostageAmount">کرایه واقعی پست (تومان)</label>
                <input id="postalPostageAmount" type="number" min="0" step="1" inputMode="numeric" value={postalPostageAmount} onChange={(event) => setPostalPostageAmount(event.target.value)} required />
                <label htmlFor="senderName">نام فرستنده</label>
                <input id="senderName" value={senderName} onChange={(event) => setSenderName(event.target.value)} maxLength={120} required />
                <label htmlFor="senderPhone">موبایل فرستنده</label>
                <input id="senderPhone" dir="ltr" inputMode="tel" value={senderPhone} onChange={(event) => setSenderPhone(event.target.value.replace(/\s/g, ''))} maxLength={15} required />
                <label htmlFor="recipientPhone">موبایل گیرنده</label>
                <input id="recipientPhone" dir="ltr" inputMode="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value.replace(/\s/g, ''))} maxLength={15} required />
                <label htmlFor="recipientName">نام گیرنده</label>
                <input id="recipientName" value={recipientName} onChange={(event) => setRecipientName(event.target.value)} maxLength={120} required />
                <label htmlFor="recipientAddress">نشانی گیرنده</label>
                <textarea id="recipientAddress" value={recipientAddress} onChange={(event) => setRecipientAddress(event.target.value)} maxLength={500} required />
                <label htmlFor="packageSize">اندازه بسته</label>
                <select id="packageSize" value={packageSize} onChange={(event) => setPackageSize(event.target.value as 'SMALL' | 'MEDIUM' | 'LARGE')}>
                  <option value="SMALL">کوچک</option><option value="MEDIUM">متوسط</option><option value="LARGE">بزرگ</option>
                </select>
                <label htmlFor="labelImage">تصویر لیبل پستی (JPEG، PNG یا WebP؛ حداکثر ۱۰ مگابایت)</label>
                <input id="labelImage" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setLabelFile(event.target.files?.[0] ?? null)} required={!draftParcelId} />
                {draftParcelId && <p className="feedback notice">پیش‌نویس مرسوله ایجاد شده است. تصویر لیبل را دوباره انتخاب کنید یا اتصال آن را تکرار کنید. شناسه: <bdi dir="ltr">{draftParcelId}</bdi></p>}
                <button className="primary-button" type="submit" disabled={workspaceBusy || Boolean(draftParcelId)}>{workspaceBusy ? 'در حال ثبت و بارگذاری…' : 'ثبت مرسوله و اتصال تصویر لیبل'}</button>
                {draftParcelId && <button className="outline-button" type="button" disabled={workspaceBusy || !labelFile} onClick={() => void retryLabelAttachment()}>تلاش مجدد برای بارگذاری و اتصال تصویر</button>}
              </form>
            </section>
          )}
          {normalizedRole === 'RECIPIENT' && workspaceMessage && <p className="feedback notice" role="status">{workspaceMessage}</p>}

          {normalizedRole === 'ADMIN' && (
            <section className="workflow-card payout-card" aria-labelledby="admin-payout-heading">
              <span className="eyebrow">ADMIN SETTLEMENT REVIEW</span>
              <h2 id="admin-payout-heading">مدیریت تسویه سفیر و هاب</h2>
              <p className="muted">مقصد را فقط پس از بررسی مستقل خارج از سامانه تأیید کنید. تأیید درخواست به‌معنای انتقال بانکی نیست.</p>
              <form onSubmit={verifyPayoutDestination} className="invitation-form">
                <label htmlFor="destinationVerifyUserId">شناسه کاربر سفیر یا مالک هاب</label>
                <input id="destinationVerifyUserId" dir="ltr" value={destinationVerifyUserId} onChange={(event) => setDestinationVerifyUserId(event.target.value.trim())} required />
                <label htmlFor="destinationVerificationReference">مرجع بررسی خارجی</label>
                <input id="destinationVerificationReference" dir="ltr" value={destinationVerificationReference} onChange={(event) => setDestinationVerificationReference(event.target.value.trim())} maxLength={160} required />
                <button className="primary-button" type="submit" disabled={payoutLoading}>{payoutLoading ? 'در حال ثبت…' : 'ثبت تأیید دستی مقصد'}</button>
              </form>
              {adminPayoutQueue.length === 0 && <p className="notification-empty">در حال حاضر درخواست تسویه‌ای برای بررسی یا ثبت نتیجه انتقال وجود ندارد.</p>}
              {adminPayoutQueue.map((item) => <article className="payout-history-item" key={item.requestId}>
                <strong>{item.amount.toLocaleString('fa-IR')} تومان · {item.beneficiaryType === 'COURIER' ? 'سفیر' : 'هاب'}</strong>
                <span>{item.status}</span>
                <small dir="ltr">درخواست: {item.requestId}</small>
                <small dir="ltr">کاربر: {item.courierId ?? item.requestedBy ?? '—'}{item.hubId ? ' · هاب: ' + item.hubId : ''}</small>
                {item.status === 'REQUESTED' ? (
                  <div className="invitation-actions">
                    <button className="primary-button" type="button" disabled={payoutLoading} onClick={() => void reviewPayoutRequest(item.requestId, 'APPROVE')}>تأیید درخواست</button>
                    <button className="outline-button" type="button" disabled={payoutLoading} onClick={() => void reviewPayoutRequest(item.requestId, 'REJECT')}>رد درخواست</button>
                  </div>
                ) : item.status === 'APPROVED' ? (
                  <div className="invitation-form">
                    <p className="muted">درخواست تأیید شده است. پس از انجام انتقال خارج از سامانه و بررسی مستقل نتیجه، مرجع خارجی را ثبت کنید.</p>
                    <label htmlFor={'transfer-reference-' + item.requestId}>مرجع خارجی انتقال یا نتیجه</label>
                    <input id={'transfer-reference-' + item.requestId} dir="ltr" maxLength={160} value={payoutTransferReferences[item.requestId] ?? ''} onChange={(event) => setPayoutTransferReferences((previous) => ({ ...previous, [item.requestId]: event.target.value }))} required />
                    <label htmlFor={'transfer-failure-' + item.requestId}>علت شکست (فقط در صورت انتقال ناموفق)</label>
                    <input id={'transfer-failure-' + item.requestId} maxLength={500} value={payoutTransferFailureReasons[item.requestId] ?? ''} onChange={(event) => setPayoutTransferFailureReasons((previous) => ({ ...previous, [item.requestId]: event.target.value }))} />
                    <div className="invitation-actions">
                      <button className="primary-button" type="button" disabled={payoutLoading} onClick={() => void recordPayoutTransferResult(item.requestId, 'COMPLETED')}>ثبت انتقال موفق</button>
                      <button className="outline-button" type="button" disabled={payoutLoading} onClick={() => void recordPayoutTransferResult(item.requestId, 'FAILED')}>ثبت انتقال ناموفق و آزادسازی مبلغ</button>
                    </div>
                  </div>
                ) : null}
              </article>)}
              {payoutError && <p className="feedback error" role="alert">{payoutError}</p>}
              {payoutMessage && <p className="feedback notice" role="status">{payoutMessage}</p>}
            </section>
          )}


          {(normalizedRole === 'COURIER' || normalizedRole === 'HUB_OWNER') && (
            <section className="workflow-card payout-card" aria-labelledby="payout-heading">
              <span className="eyebrow">WALLET & SETTLEMENT</span>
              <h2 id="payout-heading">تنظیمات و درخواست تسویه</h2>
              <p className="muted">دوره تسویه را انتخاب کنید. برای امنیت، شماره کامل کارت یا شبا را وارد نکنید؛ فقط مرجع مقصدِ تأییدشده و چهار رقم پایانی ثبت می‌شود.</p>
              <form onSubmit={savePayoutPreference} className="invitation-form">
                <label htmlFor="payoutFrequency">دوره ترجیحی تسویه</label>
                <select id="payoutFrequency" value={payoutFrequency} onChange={(event) => setPayoutFrequency(event.target.value as 'WEEKLY' | 'MONTHLY')}>
                  <option value="WEEKLY">هفتگی</option><option value="MONTHLY">ماهانه</option>
                </select>
                <label htmlFor="payoutDestinationToken">شناسه مرجع مقصد پرداخت (توکن، نه شماره حساب)</label>
                <input id="payoutDestinationToken" dir="ltr" value={payoutDestinationToken} onChange={(event) => setPayoutDestinationToken(event.target.value)} maxLength={160} placeholder="opaque-provider-reference" />
                <label htmlFor="payoutDestinationLast4">چهار رقم پایانی مقصد</label>
                <input id="payoutDestinationLast4" dir="ltr" inputMode="numeric" pattern="[0-9]{4}" value={payoutDestinationLast4} onChange={(event) => setPayoutDestinationLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} />
                <button className="primary-button" type="submit" disabled={payoutLoading}>{payoutLoading ? 'در حال ذخیره…' : 'ذخیره تنظیمات تسویه'}</button>
              </form>
              <p className={payoutDestinationVerified ? 'feedback notice' : 'feedback error'} role="status">
                {payoutDestinationVerified ? 'مقصد تسویه توسط مدیر بررسی شده است.' : payoutDestinationConfigured ? 'مقصد ثبت شده اما هنوز تأیید مدیر را ندارد؛ امکان درخواست تسویه بسته است.' : 'ابتدا شناسه مرجع مقصد را ثبت کنید؛ درخواست تسویه تا تأیید مدیر غیرفعال است.'}
              </p>
              {normalizedRole === 'HUB_OWNER' && <>
                <label htmlFor="payoutHubId">شناسه هاب شما</label>
                <input id="payoutHubId" dir="ltr" value={payoutHubId} onChange={(event) => setPayoutHubId(event.target.value.trim())} placeholder="hub UUID" />
              </>}
              <form onSubmit={requestPayout} className="invitation-form">
                <label htmlFor="payoutAmount">مبلغ درخواستی (تومان)</label>
                <input id="payoutAmount" type="number" min="1" max="2147483647" step="1" inputMode="numeric" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} required />
                <button className="primary-button" type="submit" disabled={payoutLoading || !payoutDestinationVerified}>{payoutLoading ? 'در حال ثبت…' : 'ثبت درخواست تسویه'}</button>
              </form>
              <button className="outline-button" type="button" disabled={payoutLoading} onClick={() => void loadPayoutHistory()}>به‌روزرسانی تاریخچه تسویه</button>
              {payoutError && <p className="feedback error" role="alert">{payoutError}</p>}
              {payoutMessage && <p className="feedback notice" role="status">{payoutMessage}</p>}
              {payoutHistory.length > 0 && <div className="payout-history">
                <h3>تاریخچه درخواست‌ها</h3>
                {payoutHistory.map((item) => <article className="payout-history-item" key={item.requestId}>
                  <strong>{item.amount.toLocaleString('fa-IR')} تومان</strong>
                  <span>{item.status}</span>
                  <small dir="ltr">{item.requestId}</small>
                  {item.reviewNote && <small>یادداشت مدیر: {item.reviewNote}</small>}
                  {item.transferReference && <small>مرجع انتقال تأییدشده: <bdi dir="ltr">{item.transferReference}</bdi></small>}
                </article>)}
              </div>}
              <small className="muted">تأیید مدیر فقط تأیید داخلی مقصد یا درخواست است؛ هیچ انتقال بانکی در این نسخه اجرا نمی‌شود. ترجیح هفتگی/ماهانه ذخیره می‌شود، اما زمان‌بندی خودکار هنوز فعال نیست.</small>
            </section>
          )}

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
