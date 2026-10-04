const appRoot = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');
const globalLoadingScreen = document.querySelector('#global-loading-screen');
const themeStorageKey = 'course-theme';
try {
  const savedTheme = localStorage.getItem(themeStorageKey);
  if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.dataset.theme = savedTheme;
  else document.documentElement.removeAttribute('data-theme');
} catch {}
const state = { user: null, csrf: '', today: '', route: 'dashboard', data: null, pendingBackupFile: null, examAttemptId: null, examAttempt: null, examAnswers: {}, examPendingAnswers: {}, examSaveTimer: null, examTimer: null, examIntegrityAttempt: null, examIntegrityEvents: [], examIntegrityRegistered: false, unreadNotifications: 0, notifications: [], followUpKind: 'more_than_half', followUpFilters: { q: '', level_id: '', group_id: '', absence_threshold: 25, page: 1 }, filters: { q: '', level_id: '', group_id: '', sort: 'name', page: 1 }, libraryFilters: { level_id: '', subject_id: '' }, scanner: null, scanLock: false, lastScan: '', lastScanAt: 0 };
window.__courseAppState = state;
const roleTitle = { admin: 'إدارة النظام', doctor: 'الدكتور', assistant: 'دنيا · تشغيل الكورس', student: 'حساب الطالب' };
const navItems = {
  admin: [['dashboard', 'home', 'الرئيسية'], ['academic', 'book-open', 'المواد والاختبارات'], ['library', 'notebook', 'مكتبة المحاضرات'], ['follow-up', 'list-checks', 'متابعة الطلاب'], ['students', 'users-round', 'الطلاب'], ['sessions', 'calendar-days', 'المحاضرات'], ['reports', 'chart-column', 'التقارير'], ['backup', 'database', 'النسخ الاحتياطي'], ['audit', 'clipboard-list', 'سجل العمليات'], ['system-reset', 'triangle-alert', 'مسح البيانات']],
  doctor: [['dashboard', 'home', 'الرئيسية'], ['academic', 'book-open', 'المواد والاختبارات'], ['library', 'notebook', 'مكتبة المحاضرات'], ['follow-up', 'list-checks', 'متابعة الطلاب'], ['students', 'users-round', 'الطلاب'], ['sessions', 'calendar-days', 'المحاضرات'], ['reports', 'chart-column', 'التقارير'], ['system-reset', 'triangle-alert', 'مسح البيانات']],
  assistant: [['dashboard', 'home', 'الرئيسية'], ['follow-up', 'list-checks', 'متابعة الطلاب'], ['students', 'users-round', 'الطلاب'], ['sessions', 'calendar-days', 'المحاضرات'], ['reports', 'chart-column', 'التقارير'], ['settings', 'settings', 'الإعدادات'], ['users', 'users-round', 'الفرق'], ['system-reset', 'triangle-alert', 'مسح البيانات']],
  student: [['dashboard', 'home', 'ملفي'], ['library', 'notebook', 'مكتبة المحاضرات'], ['notifications', 'bell', 'الإشعارات']]
};
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  'book-open': '<path d="M12 7v14"/><path d="M3 18V5a1 1 0 0 1 1-1h3a5 5 0 0 1 5 5 5 5 0 0 1 5-5h3a1 1 0 0 1 1 1v13h-4a5 5 0 0 0-5 3 5 5 0 0 0-5-3z"/>',
  'list-checks': '<path d="m3 5 2 2 4-4"/><path d="M12 6h9"/><path d="m3 12 2 2 4-4"/><path d="M12 13h9"/><path d="M12 20h9"/><path d="M3 19h2"/>',
  'users-round': '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'calendar-days': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01"/>',
  'chart-column': '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="13" y="8" width="3" height="10" rx="1"/><rect x="19" y="4" width="2" height="14" rx="1"/>',
  'clipboard-list': '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1Z"/><path d="M9 10h6M9 14h6M9 18h3"/><path d="M7 10h.01M7 14h.01M7 18h.01"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/><path d="M7 5V3h10v2"/>',
  'triangle-alert': '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  'calendar-clock': '<rect x="3" y="5" width="13" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h13"/><circle cx="18" cy="17" r="4"/><path d="M18 15v2l1.5 1"/>',
  'credit-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a14 14 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4-.8"/>',
  'graduation-cap': '<path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12v5c3.5 3 8.5 3 12 0v-5M22 10v6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  notebook: '<path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h13M8 8h7M8 11h5"/><path d="m16 10 4-4 2 2-4 4-3 1z"/>',
  'arrow-left': '<path d="m15 18-6-6 6-6"/>',
  'arrow-right': '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>'
  ,database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>'
};
const iconSvg = name => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
const passwordToggleMarkup = () => `<button class="password-toggle" type="button" data-action="toggle-password" aria-label="إظهار كلمة المرور" aria-pressed="false">${iconSvg('eye')}</button>`;
const welcomeMessages = {
  tamer: { name: 'أ.د. تامر النشار', message: 'دكتور تامر،\nعلمك وأسلوبك في الشرح خلاني أحب المجال ده.\nالموقع ده شكر بسيط مني على كل حاجة.\nربنا يبارك في حضرتك.' },
  tamer_nashar: { name: 'أ.د. تامر النشار', message: 'دكتور تامر،\nعلمك وأسلوبك في الشرح خلاني أحب المجال ده.\nالموقع ده شكر بسيط مني على كل حاجة.\nربنا يبارك في حضرتك.' },
  ahmed_rashad: { name: 'د. أحمد رشاد', message: 'دكتور أحمد،\nعلمك وأسلوبك في الشرح خلاني أحب المجال ده.\nالموقع ده شكر بسيط مني على كل حاجة.\nربنا يبارك في حضرتك.' },
  ahmed_alfy: { name: 'د. أحمد الألفي', message: 'دكتور أحمد،\nعلمك وأسلوبك في الشرح خلاني أحب المجال ده.\nالموقع ده شكر بسيط مني على كل حاجة.\nربنا يبارك في حضرتك.' },
  donia: { name: 'أ. دنيا', message: 'أستاذة دنيا،\nمن أول يوم شفت تعبك وصبرك معانا،\nحسيت إن لازم أعملك حاجة تساعدك في شغلك.\nالموقع ده معمول مخصوص علشان يسهل عليك شغلك ويوفر وقتك ومجهودك.\nشكرًا على كل حاجة، وربنا يوفقك دايمًا.' }
};
const moneyLabel = cents => `${(Number(cents || 0) / 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج`;
const dateLabel = value => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('ar-EG') : '—';
const timeLabel = value => {
  if (!value) return '—';
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '—';
  return new Date(Date.UTC(2020, 0, 1, hour, minute)).toLocaleTimeString('ar-EG', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true });
};
const datetimeLabel = value => value ? new Date(value).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short', hour12: true }) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const fmtCount = value => Number(value || 0).toLocaleString('ar-EG');
const bookingLabel = status => ({ unpaid: 'محجوز — لم يدفع', partial: 'محجوز — دفع جزئي', confirmed: 'مؤكد — دفع كامل', cancelled: 'ملغي' })[status] || status;
const iconButton = label => `<button class="icon-button" data-action="close-modal" aria-label="${label}" title="${label}">${iconSvg('close')}</button>`;
function sharedResourcePath() {
  const match = location.pathname.match(/^\/(exam|library)\/[a-z0-9-]+-([1-9]\d*)\/?$/i);
  return match ? { type: match[1].toLowerCase(), id: match[2] } : null;
}
async function copySharePath(path) {
  const url = new URL(path, location.origin).href;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      toast('تم نسخ رابط المشاركة');
      return;
    } catch (error) {
      console.warn('Clipboard access failed; showing the share link instead:', error);
    }
  }
  prompt('رابط المشاركة (يتطلب تسجيل الدخول والصلاحية):', url);
}
function activeTheme() {
  const preference = document.documentElement.dataset.theme;
  return preference === 'dark' || preference === 'light' ? preference : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
async function renderBackup() {
  frame(`<section class="panel backup-page"><div class="panel-head"><div><h2>النسخ الاحتياطي والاستعادة</h2><p>نسخة كاملة من قاعدة بيانات الموقع. ينصح بتنزيل نسخة يوميًا بعد أي تغييرات.</p></div><a class="button secondary" href="/api/backup">تنزيل نسخة احتياطية</a></div><form id="database-restore-form" class="form-grid"><div class="field wide"><label for="database-backup-file">ملف النسخة الاحتياطية</label><input id="database-backup-file" name="backup_file" type="file" accept=".json,application/vnd.course-backup+json" required></div><div class="form-actions wide"><button class="button danger" type="submit">استعادة نسخة احتياطية</button></div></form><div class="notice error" style="margin-top:14px">النسخة تحتوي بيانات الطلاب والحسابات؛ احتفظ بها في مكان آمن. الاستعادة تستبدل كل البيانات الحالية وتنهي جميع الجلسات.</div></section>`, 'النسخ الاحتياطي', 'حفظ واستعادة بيانات الموقع بأمان');
  const restoreForm = document.querySelector('#database-restore-form');
  restoreForm.addEventListener('submit', event => {
    event.preventDefault(); const file = restoreForm.elements.backup_file.files?.[0];
    if (!file) return toast('اختر ملف النسخة الاحتياطية أولًا.', true);
    state.pendingBackupFile = file;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><h2>تأكيد استعادة النسخة</h2>${iconButton('إغلاق')}</div><div class="notice error">سيتم استبدال كل البيانات الحالية وإنهاء الجلسات.</div><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">إلغاء</button><button type="button" class="button danger" data-action="confirm-backup-restore">استعادة كل البيانات</button></div></section></div>`);
  });
}
async function renderSystemReset() {
  const { requests } = await api('/system-reset/requests');
  const activeRequest = requests.some(request => ['pending', 'processing'].includes(request.status));
  const statusLabels = {
    pending: 'بانتظار موافقة دكتور',
    processing: 'جاري المسح',
    completed: 'اكتمل المسح',
    failed: 'تعذر إكمال المسح',
    cancelled: 'أُلغي الطلب'
  };
  const cards = requests.map(request => {
    const canApprove = ['admin', 'doctor'].includes(state.user.role) && request.status === 'pending' && request.requester_id !== state.user.id;
    const canCancel = request.status === 'pending' && request.requester_id === state.user.id;
    return `<article class="exam-list-item"><div><strong>${esc(statusLabels[request.status] || request.status)}</strong><span>صاحب الطلب: ${esc(request.requester_name)} (${['admin', 'doctor'].includes(request.requester_role) ? 'دكتور' : 'مساعد'}) · ${datetimeLabel(request.created_at)}</span>${request.approver_name ? `<span>الدكتور الموافق: ${esc(request.approver_name)}</span>` : ''}${request.failure_reason ? `<p class="notice error">${esc(request.failure_reason)}</p>` : ''}</div><div class="filters">${canApprove ? `<button class="button danger" data-system-wipe-approve="${esc(request.id)}">موافقة وبدء المسح</button>` : ''}${canCancel ? `<button class="button secondary" data-system-wipe-cancel="${esc(request.id)}">إلغاء طلبي</button>` : ''}</div></article>`;
  }).join('');
  frame(`<section class="panel"><div class="panel-head"><div><h2>طلب مسح جميع البيانات</h2><p>يمكن للدكتور أو المساعد إرسال الطلب بعد تأكيد كلمة المرور، ويحتاج التنفيذ موافقة دكتور آخر.</p></div></div><div class="notice error">الموافقة تمسح بيانات الطلاب والمجموعات والمحاضرات والحضور والمدفوعات والاختبارات والشهادات والمكتبة والإعدادات، وتحذف ملفات المكتبة والنسخ الاحتياطية التلقائية. لن تُمسح حسابات الدكاترة والمساعدة، لكن سيتم إنهاء جلسات الدخول الحالية. لا يمكن التراجع عن ذلك.</div>${!activeRequest ? `<form id="system-wipe-request-form" class="form-grid" style="margin-top:18px"><div class="field wide"><label for="system-wipe-password">كلمة مرور حسابك للتأكيد</label><input id="system-wipe-password" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></div><div class="form-actions wide"><button class="button danger" type="submit">إرسال طلب مسح جميع البيانات</button></div></form>` : '<div class="notice" style="margin-top:18px">يوجد طلب مفتوح بالفعل؛ لا يمكن إرسال طلب آخر قبل إتمامه أو إلغائه.</div>'}</section><section class="panel"><div class="panel-head"><div><h2>طلبات المسح والموافقات</h2><p>آخر 50 طلبًا</p></div></div><div class="notification-list">${cards || '<div class="empty"><strong>لا توجد طلبات مسح</strong>ستظهر هنا الطلبات والموافقات السابقة.</div>'}</div></section>`, 'مسح البيانات', 'مسح شامل يتطلب موافقة دكتور');
  document.querySelector('#system-wipe-request-form')?.addEventListener('submit', sendSystemWipeRequest);
}
async function sendSystemWipeRequest(event) {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('[type="submit"]');
  if (!confirm('سيُرسل طلبًا لمسح كل بيانات الموقع بعد موافقة دكتور آخر. هل تريد المتابعة؟')) return;
  setBusy(button, true);
  try {
    await api('/system-reset/requests', { method: 'POST', body: JSON.stringify({ password: new FormData(form).get('password') }) });
    toast('تم إرسال طلب المسح للدكاترة للموافقة');
    await renderSystemReset();
  } catch (error) {
    toast(error.message, true);
    setBusy(button, false);
  }
}
async function approveSystemWipe(id, button) {
  if (!confirm('سيبدأ فورًا مسح بيانات الطلاب والمجموعات والمحاضرات والحضور والمدفوعات والاختبارات والمكتبة والإعدادات. حسابات الدكاترة والمساعدة لن تُمسح، لكن ستنتهي جلسات الدخول الحالية. لن يمكن التراجع. هل توافق على التنفيذ؟')) return;
  setBusy(button, true, 'جارٍ مسح البيانات...');
  try {
    await api(`/system-reset/requests/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' });
    state.user = null;
    state.csrf = '';
    renderLogin('اكتمل مسح البيانات مع الاحتفاظ بحسابات الدكاترة والمساعدة. سجّل الدخول مجددًا بهذه الحسابات، ثم أعد إعداد الفرق والمجموعات المطلوبة.');
  } catch (error) {
    toast(error.message, true);
    setBusy(button, false);
    await renderSystemReset();
  }
}
async function cancelSystemWipe(id, button) {
  if (!confirm('هل تريد إلغاء طلب المسح؟')) return;
  setBusy(button, true);
  try {
    await api(`/system-reset/requests/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' });
    toast('تم إلغاء طلب المسح');
    await renderSystemReset();
  } catch (error) {
    toast(error.message, true);
    setBusy(button, false);
  }
}
function themeToggleMarkup(extraClass = '') {
  const dark = activeTheme() === 'dark', label = dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن';
  return `<button class="theme-toggle ${extraClass}" type="button" data-action="toggle-theme" aria-label="${label}" title="${label}" aria-pressed="${dark}">${iconSvg(dark ? 'sun' : 'moon')}</button>`;
}
function syncThemeControls() {
  const dark = activeTheme() === 'dark', label = dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن';
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(button => {
    button.innerHTML = iconSvg(dark ? 'sun' : 'moon'); button.setAttribute('aria-label', label); button.title = label; button.setAttribute('aria-pressed', String(dark));
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1a17' : '#f4f7f5');
}
function toggleTheme() {
  const theme = activeTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(themeStorageKey, theme); } catch {}
  syncThemeControls();
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (options.method && !['GET', 'HEAD'].includes(options.method)) headers['X-CSRF-Token'] = state.csrf;
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && state.user) { state.user = null; state.csrf = ''; renderLogin(); }
    const error = new Error(payload.error || 'تعذر إكمال الطلب');
    error.status = response.status;
    throw error;
  }
  if (response.headers.get('content-type')?.includes('application/json')) return response.json();
  return response;
}
function toast(message, bad = false) {
  toastRoot.innerHTML = `<div class="toast${bad ? ' bad' : ''}" role="${bad ? 'alert' : 'status'}" aria-live="${bad ? 'assertive' : 'polite'}">${esc(message)}</div>`;
  setTimeout(() => { toastRoot.innerHTML = ''; }, 3600);
}
document.addEventListener('invalid', event => {
  event.preventDefault();
  const input = event.target, form = input.form;
  if (form?.dataset.validationNotice) return;
  if (form) form.dataset.validationNotice = 'shown';
  const label = input.closest('.field')?.querySelector('label')?.textContent?.trim();
  let message = label ? `أدخل ${label}` : 'أكمل البيانات المطلوبة';
  if (input.id === 'payment-amount') {
    const { validity } = input;
    if (validity.badInput) message = 'أدخل مبلغًا رقميًا صحيحًا.';
    else if (validity.valueMissing) message = 'أدخل مبلغ الدفعة.';
    else if (validity.rangeUnderflow) message = 'يجب أن تكون الدفعة أكبر من صفر.';
    else if (validity.rangeOverflow) message = 'لا يمكن أن تتجاوز الدفعة المبلغ المتبقي.';
    else if (validity.stepMismatch) message = 'أدخل مبلغًا بحد أقصى منزلتين عشريتين.';
  }
  toast(message, true);
  (input._flatpickr?.altInput || input).focus();
  if (form) window.setTimeout(() => { delete form.dataset.validationNotice; }, 3600);
}, true);
function setBusy(button, busy, label = 'جارٍ التنفيذ...') {
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.disabled = true; button.textContent = label; }
  else { button.disabled = false; button.textContent = button.dataset.label || button.textContent; }
}
function renderLogin(message = '') {
  appRoot.innerHTML = `<main class="login-page"><section class="login-hero"><div class="hero-top"><div class="hero-logo"><img src="/favicon.svg" alt="S.T.C"></div><div><strong>S.T.C</strong><small>مركز السويس للتدريب</small></div></div><div class="hero-mid"><h1>إدارة الكورس<br><span class="grad">بوضوح وسرعة.</span></h1><p>الحضور، بيانات الطلاب، والمدفوعات في مساحة واحدة منظّمة.</p><div class="hero-features"><span class="hero-chip"><span>⚡</span>سريع جدًا</span><span class="hero-chip"><span>🔒</span>آمن</span><span class="hero-chip"><span>📱</span>يعمل على كل الأجهزة</span></div></div><div class="hero-bottom"><span>إدارة تعليمية آمنة</span><span>توقيت القاهرة</span></div></section><section class="login-side"><form id="login-form"><h2 id="login-welcome">أهلاً بك</h2><p class="sub">سجّل الدخول لمتابعة الكورس.</p>${message ? `<div class="notice error">${esc(message)}</div>` : ''}<div class="input-group"><input id="username" name="username" type="text" placeholder=" " autocomplete="username" required autofocus><label for="username">اسم المستخدم</label></div><div class="input-group"><input id="password" type="password" data-password-input name="password" placeholder=" " autocomplete="current-password" required>${passwordToggleMarkup()}<label for="password">كلمة المرور</label></div><label class="remember-login"><input name="remember" type="checkbox"> تذكر بيانات الدخول على هذا الجهاز</label><button class="login-btn" type="submit">دخول</button><button class="button secondary install-app-button" type="button" hidden>تثبيت التطبيق</button></form></section></main>`;
  document.querySelector('#login-form').addEventListener('submit', login);
  document.querySelector('.login-side')?.insertAdjacentHTML('afterbegin', themeToggleMarkup());
  const usernameInput = document.querySelector('#username');
  usernameInput.addEventListener('input', () => updateLoginWelcome(usernameInput.value));
  updateLoginWelcome(usernameInput.value);
  setupInstallButton();
}
let deferredInstallPrompt;
function setupInstallButton() {
  const button = document.querySelector('.install-app-button');
  if (!button) return;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  button.hidden = isStandalone || (!deferredInstallPrompt && !isIOS);
  button.onclick = async () => {
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        await promptEvent.prompt();
        await promptEvent.userChoice;
      } catch (error) {
        toast(error.message || 'تعذر بدء تثبيت التطبيق.', true);
      } finally {
        button.hidden = true;
      }
      return;
    }
    if (isIOS && !isStandalone) showIosInstallInstructions();
  };
}
function showIosInstallInstructions() {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true" aria-labelledby="ios-install-title"><div class="modal-head"><h2 id="ios-install-title">تثبيت التطبيق على iPhone أو iPad</h2>${iconButton('إغلاق')}</div><p>لإضافة التطبيق إلى الشاشة الرئيسية:</p><ol><li>افتح هذه الصفحة في متصفح Safari.</li><li>اضغط زر المشاركة <strong>مشاركة</strong> أسفل الشاشة أو أعلاها.</li><li>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>، ثم اضغط <strong>إضافة</strong>.</li></ol><div class="form-actions"><button type="button" class="button" data-action="close-modal">حسنًا</button></div></section></div>`);
}
function updateLoginWelcome(username) {
  const key = String(username || '').trim().toLowerCase();
  let returning = false;
  try { returning = Boolean(key && localStorage.getItem(`course-login-seen:${key}`)); } catch {}
  const heading = document.querySelector('#login-welcome');
  if (heading) heading.textContent = returning ? 'أهلاً بعودتك' : 'أهلاً بك';
}
function rememberLogin(username) {
  try { localStorage.setItem(`course-login-seen:${String(username).trim().toLowerCase()}`, '1'); } catch {}
}
function togglePassword(button) {
  const input = button.closest('.input-group, .password-input-wrap')?.querySelector('[data-password-input]');
  if (!input) return;
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.innerHTML = iconSvg(visible ? 'eye-off' : 'eye');
  button.setAttribute('aria-label', visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
  button.setAttribute('aria-pressed', String(visible));
}
function showWelcomeSplash(userId) {
  const user = state.user;
  if (!user || String(user.id) !== String(userId)) return;
  const message = welcomeMessages[String(user.username || '').trim().toLowerCase()];
  const splash = document.querySelector('#welcome-splash'), modal = document.querySelector('#welcome-modal');
  if (!message || !splash || !modal || !splash.hidden || !modal.hidden) return;

  const storageKey = `welcome_shown_${userId}`;
  try { if (localStorage.getItem(storageKey)) return; } catch {}

  document.querySelector('[data-welcome-splash-name]').textContent = message.name;
  splash.classList.remove('is-exiting');
  splash.hidden = false;
  modal.dataset.userId = String(userId);
  window.setTimeout(() => {
    if (String(state.user?.id) !== String(userId) || splash.hidden) return;
    splash.classList.add('is-exiting');
    window.setTimeout(() => {
      if (String(state.user?.id) !== String(userId) || splash.hidden) return;
      splash.hidden = true;
      splash.classList.remove('is-exiting');
      document.querySelector('#welcome-title').textContent = message.name;
      document.querySelector('#welcome-message').textContent = message.message;
      modal.hidden = false;
      modal.classList.remove('is-closing');
      modal.setAttribute('aria-hidden', 'false');
      document.querySelector('[data-welcome-close]')?.focus();
    }, 300);
  }, 2000);
}
function closeWelcome(userId = document.querySelector('#welcome-modal')?.dataset.userId) {
  const modal = document.querySelector('#welcome-modal');
  if (!modal || modal.hidden || modal.classList.contains('is-closing')) return;
  modal.classList.add('is-closing');
  window.setTimeout(() => {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.classList.remove('is-closing');
    delete modal.dataset.userId;
    try { if (userId) localStorage.setItem(`welcome_shown_${userId}`, '1'); } catch {}
  }, 300);
}
function openMobileDrawer() {
  const drawer = document.querySelector('.mobile-drawer'), backdrop = document.querySelector('.mobile-drawer-backdrop');
  if (!drawer || !backdrop || !drawer.hidden) return;
  drawer.classList.remove('is-closing');
  drawer.hidden = false; backdrop.hidden = false;
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('mobile-drawer-open');
  document.querySelector('.mobile-menu-button')?.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => { drawer.classList.add('is-open'); backdrop.classList.add('is-open'); });
  drawer.querySelector('.mobile-drawer-close')?.focus();
}
function closeMobileDrawer(restoreFocus = true) {
  const drawer = document.querySelector('.mobile-drawer'), backdrop = document.querySelector('.mobile-drawer-backdrop');
  if (!drawer || !backdrop || drawer.hidden) return;
  drawer.classList.add('is-closing'); drawer.classList.remove('is-open'); backdrop.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('mobile-drawer-open');
  document.querySelector('.mobile-menu-button')?.setAttribute('aria-expanded', 'false');
  window.setTimeout(() => {
    if (drawer.classList.contains('is-open')) return;
    drawer.hidden = true; backdrop.hidden = true;
    if (restoreFocus) document.querySelector('.mobile-menu-button')?.focus();
  }, 250);
}
let pageLoadingHideTimer = null;
let pageLoadingShowFrame = null;
function hideGlobalLoading() {
  if (!globalLoadingScreen || globalLoadingScreen.hidden) return Promise.resolve();
  globalLoadingScreen.classList.add('is-hiding');
  return new Promise(resolve => window.setTimeout(() => {
    globalLoadingScreen.hidden = true;
    globalLoadingScreen.classList.remove('is-hiding');
    resolve();
  }, 300));
}
function showPageLoading(message = 'جارٍ تحميل الصفحة...') {
  let loader = document.querySelector('#page-loading');
  if (!loader) {
    document.body.insertAdjacentHTML('beforeend', `<div id="page-loading" class="page-loading" role="status" aria-live="polite" hidden><div class="page-loading-card"><span class="page-loading-spinner" aria-hidden="true"></span><span data-page-loading-label></span></div></div>`);
    loader = document.querySelector('#page-loading');
  }
  if (pageLoadingHideTimer) {
    clearTimeout(pageLoadingHideTimer);
    pageLoadingHideTimer = null;
  }
  if (pageLoadingShowFrame !== null) {
    cancelAnimationFrame(pageLoadingShowFrame);
    pageLoadingShowFrame = null;
  }
  loader.querySelector('[data-page-loading-label]').textContent = message;
  loader.hidden = false;
  loader.classList.remove('is-visible');
  pageLoadingShowFrame = requestAnimationFrame(() => {
    pageLoadingShowFrame = null;
    if (!loader.hidden) loader.classList.add('is-visible');
  });
}
function hidePageLoading() {
  const loader = document.querySelector('#page-loading');
  if (!loader) return;
  if (pageLoadingShowFrame !== null) {
    cancelAnimationFrame(pageLoadingShowFrame);
    pageLoadingShowFrame = null;
  }
  if (pageLoadingHideTimer) {
    clearTimeout(pageLoadingHideTimer);
    pageLoadingHideTimer = null;
  }
  loader.classList.remove('is-visible');
  pageLoadingHideTimer = window.setTimeout(() => {
    pageLoadingHideTimer = null;
    if (!loader.classList.contains('is-visible')) loader.hidden = true;
  }, 180);
}
async function login(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); setBusy(button, true, 'جارٍ التحقق...'); toast('جارٍ التحقق...');
  try {
    const form = new FormData(event.currentTarget), result = await api('/login', { method: 'POST', body: JSON.stringify({ username: form.get('username'), password: form.get('password'), remember: form.get('remember') === 'on' }) });
    rememberLogin(form.get('username'));
    state.user = result.user; state.csrf = result.csrf; const me = await api('/me'); state.today = me.today; state.route = 'dashboard'; showWelcomeSplash(state.user.id); await render();
  } catch (error) { renderLogin(error.message); }
}
function frame(content, title, subtitle = '') {
  const items = navItems[state.user.role] || navItems.student;
  const links = items.map(([id, icon, label]) => `<button class="${state.route === id ? 'active' : ''}" data-route="${id}"><span class="nav-icon">${iconSvg(icon)}</span>${label}</button>`).join('');
  const mobileNames = { dashboard: state.user.role === 'assistant' ? 'الرئيسية' : state.user.role === 'student' ? 'ملفي' : 'الرئيسية', academic: 'مواد', library: 'المكتبة', 'follow-up': 'متابعة', notifications: 'إشعارات', students: 'الطلاب', sessions: 'محاضرات', reports: 'تقارير', backup: 'نسخ احتياطي', settings: 'إعدادات', users: 'حسابات', audit: 'السجل', 'system-reset': 'مسح بيانات' };
  const mobile = items.map(([id, icon]) => `<button class="${state.route === id ? 'active' : ''}" data-route="${id}"><span>${iconSvg(icon)}</span>${mobileNames[id]}</button>`).join('');
  const notificationButton = `${themeToggleMarkup()}${state.user.role === 'student' ? `<button class="notification-bell" data-action="open-notifications" aria-label="الإشعارات">${iconSvg('bell')}${state.unreadNotifications ? `<span class="notification-badge">${fmtCount(state.unreadNotifications)}</span>` : ''}</button>` : ''}`;
  const mobileHeaderBell = state.user.role === 'student' ? `<button class="notification-bell mobile-header-bell" data-action="open-notifications" aria-label="الإشعارات">${iconSvg('bell')}${state.unreadNotifications ? `<span class="notification-badge">${fmtCount(state.unreadNotifications)}</span>` : ''}</button>` : '<span class="mobile-header-spacer" aria-hidden="true"></span>';
  const drawerLinks = items.map(([id, icon, label]) => `<button class="mobile-drawer-link ${state.route === id ? 'active' : ''}" data-route="${id}"><span class="nav-icon">${iconSvg(icon)}</span>${label}</button>`).join('');
  const passwordControls = ['admin', 'doctor'].includes(state.user.role) ? '' : '<button data-action="change-password">تغيير كلمة المرور</button>';
  const mobileChrome = `<header class="mobile-header"><button class="mobile-menu-button" type="button" data-action="open-mobile-drawer" aria-label="فتح القائمة" aria-controls="mobile-drawer" aria-expanded="false">${iconSvg('menu')}</button><strong class="mobile-header-brand">S.T.C<span>مركز السويس للتدريب</span></strong>${mobileHeaderBell}</header><div class="mobile-drawer-backdrop" data-action="close-mobile-drawer" hidden></div><aside id="mobile-drawer" class="mobile-drawer" aria-label="قائمة الصفحات" aria-hidden="true" hidden><div class="mobile-drawer-head"><div>${iconSvg('graduation-cap')}<span class="mobile-drawer-brand"><strong>S.T.C</strong><small>مركز السويس للتدريب</small></span></div><button class="mobile-drawer-close" type="button" data-action="close-mobile-drawer" aria-label="إغلاق القائمة">${iconSvg('close')}</button></div><div class="mobile-drawer-user"><strong>${esc(state.user.name)}</strong><span>${roleTitle[state.user.role]}</span></div><nav class="mobile-drawer-nav">${drawerLinks}</nav><button class="mobile-drawer-logout" data-action="logout">تسجيل الخروج</button></aside>`;
  appRoot.innerHTML = `<div class="layout">${mobileChrome}<aside class="sidebar"><div class="brand"><strong>S.T.C</strong><small>مركز السويس للتدريب</small></div><nav class="nav">${links}</nav><div class="side-bottom"><div class="user-line">${esc(state.user.name)}<small>${roleTitle[state.user.role]}</small></div>${passwordControls}<button data-action="logout">تسجيل الخروج</button></div></aside><main class="content"><header class="topbar"><div><span class="mobile-brand">S.T.C</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="top-actions">${notificationButton}${['admin', 'doctor'].includes(state.user.role) ? '' : '<button class="button secondary" data-action="change-password">تغيير كلمة المرور</button>'}<span class="tag">${dateLabel(state.today)}</span></div></header>${content}</main><nav class="mobile-nav" style="--nav-count:${items.length + 1}">${mobile}<button data-action="logout"><span>${iconSvg('log-out')}</span>خروج</button></nav></div>`;
  appRoot.querySelectorAll('form').forEach(setupDateTimePickers);
  appRoot.querySelectorAll('.pagination button').forEach(button => {
    const previous = ['page', 'followUpPage', 'resultsPage'].some(key => button.dataset[key] === '-1');
    button.insertAdjacentHTML('afterbegin', iconSvg(previous ? 'arrow-right' : 'arrow-left'));
  });
}
async function render() {
  if (!state.user) return renderLogin();
  try {
    await stopScanner();
    const sharedResource = sharedResourcePath();
    if (sharedResource?.type === 'library') {
      if (['admin', 'doctor', 'student'].includes(state.user.role)) {
        location.assign(`/api/library/share/${encodeURIComponent(sharedResource.id)}/file`);
        return;
      }
      history.replaceState(null, '', '/');
    }
    if (state.user.role === 'student') {
      if (state.route === 'notifications') return await renderNotificationInbox();
      if (state.route === 'library') return await renderLibrary();
      if (state.route === 'exam-attempt') return await renderExamAttempt();
      if (state.route === 'exam-review') return await renderExamReview();
      return await renderStudent();
    }
    if (state.route === 'academic' && ['admin', 'doctor'].includes(state.user.role)) return await renderAcademic();
    if (state.route === 'library' && ['admin', 'doctor'].includes(state.user.role)) return await renderLibrary();
    if (state.route === 'backup' && state.user.role === 'admin') return await renderBackup();
    if (state.route === 'users' && state.user.role === 'assistant') return await renderUsers();
    if (state.route === 'system-reset') return await renderSystemReset();
    if (state.route === 'dashboard') return await renderDashboard();
    if (state.route === 'follow-up') return await renderFollowUp();
    if (state.route === 'students') return await renderStudents();
    if (state.route === 'sessions') return await renderSessions();
    if (state.route === 'reports') return renderReports();
    if (state.route === 'settings' && state.user.role === 'assistant') return await renderSettings();
    if (state.route === 'audit' && state.user.role === 'admin') return await renderAudit();
    state.route = 'dashboard'; return render();
  } catch (error) { frame(`<section class="panel"><div class="notice error">${esc(error.message)}</div><button class="button secondary" data-action="refresh" style="margin-top:14px">إعادة المحاولة</button></section>`, 'تعذر تحميل البيانات'); }
}
async function renderDashboard() {
  const data = await api('/dashboard'); state.data = data;
  if (state.user.role === 'assistant') return renderAssistant(data);
  const stats = [['إجمالي الحجوزات', data.booking.total], ['لم يدفعوا', data.booking.unpaid], ['دفع جزئي', data.booking.partial], ['دفع كامل', data.booking.confirmed], ['إجمالي المدفوع', moneyLabel(data.booking.paid)], ['إجمالي المتبقي', moneyLabel(data.booking.remaining)]];
  if (data.phase.course_started) stats.splice(1, 0, ['حضور اليوم', data.present], ['غياب اليوم', data.absent]);
  const rows = data.levels.map(level => `<article class="level-row"><h3>${esc(level.name)}</h3><div class="level-metrics"><span>الطلاب<b>${fmtCount(level.bookings)}</b></span>${data.phase.course_started ? `<span>الحضور<b>${fmtCount(level.present)}</b></span><span>الغياب<b>${fmtCount(level.absent)}</b></span>` : ''}<span>المدفوع<b>${moneyLabel(level.paid)}</b></span><span>المتبقي<b>${moneyLabel(level.remaining)}</b></span></div><div class="filters">${level.groups.map(group => `<button class="button secondary" data-group="${group.id}">${esc(group.name)}: ${fmtCount(group.bookings)}</button>`).join('')}</div></article>`).join('');
  const followUp = data.follow_up;
  const followUpWidget = `<section class="panel"><div class="panel-head"><div><h2>يحتاجون متابعة</h2><p>ملخص من سجلات الطلاب والحضور والمدفوعات.</p></div><button class="button secondary" data-route="follow-up">فتح المتابعة</button></div><div class="grid follow-up-cards">${followUpCards(followUp).map(card => `<button class="follow-up-card" data-follow-up-kind="${card.id}"><span>${iconSvg(card.icon)} ${card.label}</span><strong>${fmtCount(followUp[card.count])}</strong><small>${card.description}</small></button>`).join('')}</div></section>`;
  const backupPanel = '';
  const phaseNotice = data.phase.course_started ? `<div class="notice">${iconSvg('graduation-cap')} الكورس بدأ · المحاضرات والحضور مفعّلان</div>` : `<div class="notice">${data.phase.booking_open ? `${iconSvg('book-open')} الحجز مفتوح` : 'الحجز مغلق'} · المحاضرات لم تبدأ بعد</div>`;
  frame(`${phaseNotice}<section class="grid stats">${stats.map(([label, value]) => `<article class="stat"><span>${label}</span><strong>${typeof value === 'number' ? fmtCount(value) : value}</strong></article>`).join('')}</section>${followUpWidget}${backupPanel}<section class="panel"><div class="panel-head"><div><h2>ملخص الفرق والمجموعات</h2><p>ملخص الحجوزات والدفعات من قاعدة البيانات.</p></div></div><div class="grid level-grid">${rows}</div></section>`, 'لوحة الكورس', state.user.role === 'admin' ? 'عرض ومتابعة دون صلاحيات تشغيلية' : 'الحجوزات والمدفوعات والمرحلة الحالية');
  const restoreForm = document.querySelector('#database-restore-form');
  if (restoreForm) restoreForm.addEventListener('submit', event => {
    event.preventDefault();
    const file = restoreForm.elements.backup_file.files?.[0];
    if (!file) return toast('اختر ملف النسخة الاحتياطية أولًا.', true);
    state.pendingBackupFile = file;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true" aria-labelledby="restore-backup-title"><div class="modal-head"><h2 id="restore-backup-title">تأكيد استعادة النسخة</h2>${iconButton('إغلاق')}</div><div class="notice error">سيتم استبدال كل بيانات الموقع الحالية بالبيانات الموجودة في النسخة، وسيتم إنهاء جميع الجلسات. لا يمكن التراجع إلا باستعادة نسخة أخرى.</div><p class="muted" style="margin-top:12px">الملف المحدد: ${esc(file.name)}</p><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">إلغاء</button><button type="button" class="button danger" data-action="confirm-backup-restore">استعادة كل البيانات</button></div></section></div>`);
  });
}
async function restoreDatabaseBackup() {
  const file = state.pendingBackupFile, button = document.querySelector('[data-action="confirm-backup-restore"]');
  if (!file || !button) return;
  setBusy(button, true, 'جارٍ التحقق والاستعادة...');
  try {
    const response = await fetch('/api/backup/restore', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/vnd.course-backup+json', 'X-CSRF-Token': state.csrf }, body: file });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'تعذرت استعادة النسخة الاحتياطية.');
    state.user = null; state.csrf = ''; state.data = null; state.pendingBackupFile = null;
    closeModal(); renderLogin(); toast('تمت الاستعادة. سجّل الدخول ببيانات النسخة الاحتياطية.');
  } catch (error) { toast(error.message, true); setBusy(button, false); }
}
async function renderAssistant(data) {
  if (!data) data = await api('/dashboard');
  const scan = data.phase.course_started ? `<div class="scan-actions"><button class="button large" data-action="scan">فتح الكاميرا</button><label class="button secondary large">اختيار صورة QR<input class="hidden" type="file" accept="image/*" data-action="scan-file"></label></div><div id="scan-reader" class="scan-reader hidden"></div>` : `<div class="notice">${iconSvg('book-open')} الحجز مفتوح — المحاضرات لم تبدأ بعد. سيُفعّل ماسح QR عند تحديد بداية الكورس.</div>`;
  const stats = [['إجمالي الحجوزات', data.booking.total], ['لم يدفعوا', data.booking.unpaid], ['دفع جزئي', data.booking.partial], ['دفع كامل', data.booking.confirmed], ['إجمالي المدفوع', moneyLabel(data.booking.paid)], ['إجمالي المتبقي', moneyLabel(data.booking.remaining)]];
  if (data.phase.course_started) stats.splice(1, 0, ['حضور اليوم', data.present], ['غياب اليوم', data.absent]);
  const current = data.phase.course_started ? `<section class="panel"><div class="panel-head"><h2>المحاضرة الحالية</h2></div>${data.current_sessions.length ? data.current_sessions.map(session => `<div class="notice">${esc(session.level_name)} · ${esc(session.group_name)} · ${esc(session.title)} · ${timeLabel(session.start_time)}${session.end_time ? `–${timeLabel(session.end_time)}` : ''}</div>`).join('') : '<div class="empty">لا توجد محاضرة جارية الآن.</div>'}</section>` : '';
  frame(`<div class="notice">${data.phase.course_started ? `${iconSvg('graduation-cap')} الكورس بدأ` : `${data.phase.booking_open ? `${iconSvg('book-open')} الحجز مفتوح` : 'الحجز مغلق'} — المحاضرات لم تبدأ بعد`}</div><section class="grid stats">${stats.map(([label, value]) => `<article class="stat"><span>${label}</span><strong>${typeof value === 'number' ? fmtCount(value) : value}</strong></article>`).join('')}</section>${current}<section class="grid assistant-grid"><article class="panel scan-box">${scan}<div class="field" style="text-align:right;margin-top:20px"><label for="lookup-code">البحث بكود الطالب</label><div style="display:flex;gap:8px"><input id="lookup-code" inputmode="text" placeholder="مثال: 3157"><button class="button" data-action="lookup">بحث</button></div></div><div class="filters"><button class="button" data-action="new-student" ${data.phase.booking_open ? '' : 'disabled'}>إضافة حجز</button><button class="button secondary" data-route="follow-up">متابعة الطلاب</button></div></article><article id="assistant-result"></article></section><section class="panel"><div class="panel-head"><div><h2>حالة الكورس</h2><p>${data.phase.course_started ? 'إدارة المحاضرات وتسجيل الحضور متاحان.' : 'تسجيل الحجوزات والدفعات متاح. الحضور والغياب غير مفعّلين.'}</p></div><button class="button secondary" data-route="sessions">إدارة المحاضرات</button></div></section>`, 'لوحة دنيا', 'تشغيل الحجز والمدفوعات والمحاضرات');
  if (data.phase.course_started) {
    const statusNotice = document.querySelector('.content > .notice');
    if (statusNotice) statusNotice.innerHTML = `${iconSvg('graduation-cap')} الحضور متاح الآن`;
  }
  if (data.phase.course_started) {
    const addStudent = document.querySelector('[data-action="new-student"]');
    if (addStudent) { addStudent.disabled = false; addStudent.textContent = 'إضافة طالب'; }
  }
}
function followUpCards(counts) {
  return [
    { id: 'more_than_half', count: 'more_than_half', label: 'عليهم أكثر من 50%', icon: 'wallet', description: 'مبالغ متبقية تتجاوز نصف سعر الكورس' },
    { id: 'high_absence', count: 'high_absence', label: 'غياب مرتفع', icon: 'triangle-alert', description: `غياب ${counts.threshold ?? 25}% أو أكثر` },
    { id: 'missed_last_two', count: 'missed_last_two', label: 'لم يحضروا آخر محاضرتين', icon: 'calendar-clock', description: 'محاضرتان فعليتان مسجلتان للمجموعة' },
    { id: 'no_payment', count: 'no_payment', label: 'لم يسددوا أي دفعة', icon: 'credit-card', description: 'إجمالي المدفوع يساوي صفرًا' }
  ];
}
function relativeTime(value) {
  if (!value) return '—';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime()) / 1000;
  const units = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  const [size, unit] = units.find(([seconds]) => elapsed >= seconds) || [1, 'second'];
  return new Intl.RelativeTimeFormat('ar', { numeric: 'auto' }).format(-Math.floor(elapsed / size), unit);
}
function reminderStatus(student) {
  const reminder = student.last_payment_reminder;
  if (!reminder) return '<span class="muted">لا يوجد تذكير سابق</span>';
  return `<span class="reminder-status">${iconSvg('bell')} تم الإرسال ${relativeTime(reminder.sent_at)}</span><span class="reminder-status ${reminder.is_read ? 'viewed' : 'not-viewed'}">${reminder.is_read ? `${iconSvg('eye')} تمت المشاهدة ${relativeTime(reminder.read_at)}` : `${iconSvg('eye-off')} لم تتم المشاهدة`}</span>`;
}
async function renderFollowUp() {
  const params = new URLSearchParams({ page: state.followUpFilters.page, size: 20 });
  for (const [key, value] of Object.entries(state.followUpFilters)) if (value) params.set(key, value);
  const [meta, data] = await Promise.all([api('/meta'), api(`/follow-up?${params}`)]);
  const kind = state.followUpKind, list = data.lists[kind] || [];
  const heading = followUpCards(data.counts).find(card => card.id === kind);
  let columns = '', rows = '';
  if (kind === 'high_absence') {
    columns = '<th>الاسم</th><th>الكود</th><th>الفرقة</th><th>المجموعة</th><th>أيام الحضور</th><th>أيام الغياب</th><th>نسبة الحضور</th><th>نسبة الغياب</th>';
    rows = list.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.code)}</td><td>${esc(s.level_name)}</td><td>${esc(s.group_name)}</td><td>${fmtCount(s.present)}</td><td>${fmtCount(s.absent)}</td><td>${s.presence_percentage}%</td><td>${s.absence_percentage}%</td></tr>`).join('');
  } else if (kind === 'missed_last_two') {
    columns = '<th>الاسم</th><th>الكود</th><th>الفرقة</th><th>المجموعة</th><th>آخر حضور</th><th>المحاضرتان الأخيرتان</th>';
    rows = list.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.code)}</td><td>${esc(s.level_name)}</td><td>${esc(s.group_name)}</td><td>${dateLabel(s.last_attendance)}</td><td>${s.last_two_sessions.map(session => `${dateLabel(session.date)}: ${session.status}`).join(' · ')}</td></tr>`).join('');
  } else {
    columns = `<th>الاسم</th><th>الكود</th><th>الفرقة</th><th>المجموعة</th><th>قيمة الكورس</th>${kind === 'more_than_half' ? '<th>إجمالي المدفوع</th>' : ''}<th>المتبقي</th><th>آخر تذكير</th>${state.user.role === 'assistant' ? '<th>إجراء</th>' : ''}`;
    rows = list.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.code)}</td><td>${esc(s.level_name)}</td><td>${esc(s.group_name)}</td><td>${moneyLabel(s.course_price_snapshot)}</td>${kind === 'more_than_half' ? `<td>${moneyLabel(s.paid)}</td>` : ''}<td>${moneyLabel(s.remaining)}</td><td><div class="reminder-history">${reminderStatus(s)}</div></td>${state.user.role === 'assistant' ? `<td><button class="button secondary" data-reminder-student="${s.id}">${iconSvg('bell')} تذكير بالدفع</button></td>` : ''}</tr>`).join('');
  }
  const filters = `<div class="filters follow-up-filters"><input class="search-input" id="follow-up-search" value="${esc(state.followUpFilters.q)}" placeholder="ابحث بالاسم أو الكود"><select id="follow-up-level"><option value="">كل الفرق</option>${meta.levels.map(level => `<option value="${level.id}" ${String(level.id) === String(state.followUpFilters.level_id) ? 'selected' : ''}>${esc(level.name)}</option>`).join('')}</select><select id="follow-up-group"><option value="">كل المجموعات</option>${meta.groups.map(group => `<option value="${group.id}" ${String(group.id) === String(state.followUpFilters.group_id) ? 'selected' : ''}>${esc(meta.levels.find(level => level.id === group.level_id)?.name)} · ${esc(group.name)}</option>`).join('')}</select><label class="threshold-field">حد الغياب<select id="absence-threshold">${[10, 20, 25, 30, 40, 50].map(value => `<option value="${value}" ${Number(data.threshold) === value ? 'selected' : ''}>${value}% فأكثر</option>`).join('')}</select></label></div>`;
  const cards = `<div class="grid follow-up-cards">${followUpCards(data.counts).map(card => `<button class="follow-up-card ${kind === card.id ? 'selected' : ''}" data-follow-up-kind="${card.id}"><span>${iconSvg(card.icon)} ${card.label}</span><strong>${fmtCount(data.counts[card.count])}</strong></button>`).join('')}</div>`;
  const total = data.list_totals[kind] || 0, pages = Math.max(1, Math.ceil(total / data.size));
  const pagination = total > data.size ? `<div class="pagination"><button class="button secondary" data-follow-up-page="-1" ${data.page <= 1 ? 'disabled' : ''}>السابق</button><span>${fmtCount(data.page)} / ${fmtCount(pages)}</span><button class="button secondary" data-follow-up-page="1" ${data.page >= pages ? 'disabled' : ''}>التالي</button></div>` : '';
  frame(`<section class="panel">${cards}${filters}<div class="panel-head"><div><h2>${heading.label}</h2><p>${kind === 'high_absence' ? `نسبة الغياب ${data.threshold}% فأكثر · ${fmtCount(total)} طالب` : `${fmtCount(total)} طالب`}</p></div></div>${rows ? `<div class="table-scroll"><table><thead><tr>${columns}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><strong>لا توجد نتائج مطابقة</strong>تتحدث القوائم تلقائيًا عند تغير الحضور أو المدفوعات.</div>'}${pagination}</section>`, 'متابعة الطلاب', 'قوائم متابعة محسوبة من بيانات الكورس');
  const groupSelect = document.querySelector('#follow-up-group');
  [...groupSelect.options].forEach(option => {
    if (!option.value) return;
    const group = meta.groups.find(item => String(item.id) === option.value);
    option.hidden = Boolean(state.followUpFilters.level_id && String(group?.level_id) !== String(state.followUpFilters.level_id));
  });
  document.querySelector('#follow-up-search').addEventListener('input', debounce(event => { state.followUpFilters.q = event.target.value; state.followUpFilters.page = 1; renderFollowUp(); }, 250));
  document.querySelector('#follow-up-level').addEventListener('change', event => { state.followUpFilters.level_id = event.target.value; state.followUpFilters.group_id = ''; state.followUpFilters.page = 1; renderFollowUp(); });
  document.querySelector('#follow-up-group').addEventListener('change', event => { state.followUpFilters.group_id = event.target.value; state.followUpFilters.page = 1; renderFollowUp(); });
  document.querySelector('#absence-threshold').addEventListener('change', event => { state.followUpFilters.absence_threshold = Number(event.target.value); state.followUpFilters.page = 1; renderFollowUp(); });
}
async function openReminder(studentId) {
  try {
    const student = await api(`/students/${studentId}`); state.data = student;
    const defaultMessage = `تذكير بالدفع: متبقي عليك ${moneyLabel(student.remaining)} من قيمة الكورس. برجاء سداد المبلغ المتبقي في أقرب وقت. — S.T.C - مركز السويس للتدريب`;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true" aria-labelledby="reminder-title"><div class="modal-head"><h2 id="reminder-title">تأكيد تذكير الدفع</h2>${iconButton('إغلاق')}</div><div class="reminder-balance"><strong>اسم الطالب: ${esc(student.name)}</strong><span>قيمة الكورس: ${moneyLabel(student.price)}</span><span>المدفوع: ${moneyLabel(student.paid)}</span><span>المتبقي: ${moneyLabel(student.remaining)}</span></div><form id="reminder-form" data-student="${student.id}" style="margin-top:16px"><div class="field"><label for="reminder-message">رسالة الإشعار داخل الموقع</label><textarea id="reminder-message" name="message" minlength="10" maxlength="1000" required>${esc(defaultMessage)}</textarea></div><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">إلغاء</button><button class="button">إرسال التذكير</button></div></form></section></div>`);
    document.querySelector('#reminder-form').addEventListener('submit', sendPaymentReminder);
  } catch (error) { toast(error.message, true); }
}
async function sendPaymentReminder(event) {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type="submit"]') || form.querySelector('.button:last-child'); setBusy(button, true);
  try {
    const result = await api('/notifications/payment-reminder', { method: 'POST', body: JSON.stringify({ student_id: Number(form.dataset.student), message: form.elements.message.value }) });
    closeModal(); toast(`تم إرسال التذكير إلى ${state.data?.name || 'الطالب'} داخل الموقع`); state.followUpKind = result.remaining > result.course_price / 2 ? 'more_than_half' : 'no_payment'; await renderFollowUp();
  } catch (error) { toast(error.message, true); setBusy(button, false); }
}
async function sendStudentCertificate(studentId, button) {
  if (!confirm('سيتم إرسال شهادة هذا الطالب فقط إلى حسابه، مع إشعار خاص به. هل تريد المتابعة؟')) return;
  setBusy(button, true, 'جارٍ إرسال الشهادة...');
  try {
    const result = await api(`/students/${studentId}/certificate`, { method: 'POST', body: '{}' });
    toast(result.resent ? 'تمت إعادة إرسال الشهادة وإشعار الطالب' : 'تم إرسال الشهادة وإشعار الطالب');
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}
async function sendExamCertificate(button) {
  const examId = Number(document.querySelector('[data-results-tab]')?.dataset.exam);
  if (!Number.isSafeInteger(examId) || !examId) return toast('تعذر تحديد الاختبار؛ أعد تحميل النتائج.', true);
  if (!confirm('سيتم إرسال شهادة هذا الاختبار إلى حساب الطالب، موضحًا بها الدرجة والنسبة. هل تريد المتابعة؟')) return;
  const query = {
    page: Number(document.querySelector('.pagination span')?.textContent?.split('/')[0]?.trim() || 1),
    tab: [...document.querySelectorAll('[data-results-tab]')].find(item => !item.classList.contains('secondary'))?.dataset.resultsTab || 'attempted',
    q: document.querySelector('#exam-result-search')?.value || '',
    status: document.querySelector('#exam-result-status')?.value || '',
    integrity: document.querySelector('#exam-result-integrity')?.value || ''
  };
  setBusy(button, true, 'جارٍ إرسال الشهادة...');
  try {
    const result = await api(`/academic/exam-attempts/${button.dataset.examCertificate}/certificate`, {
      method: 'POST', body: '{}'
    });
    toast(result.resent ? 'تمت إعادة إرسال شهادة الاختبار' : 'تم إرسال شهادة الاختبار');
    await showExamResults(examId, query);
  } catch (error) {
    toast(error.message, true);
    setBusy(button, false);
  }
}
async function renderStudents() {
  const [meta, result] = await Promise.all([api('/meta'), api(studentQuery())]);
  const attendanceColumns = meta.phase.course_started ? '<th>حضور</th><th>غياب</th>' : '';
  const deleteColumn = state.user.role === 'assistant' ? '<th>إجراء</th>' : '';
  const table = result.items.length ? `<div class="table-scroll"><table><thead><tr><th>الكود</th><th>الاسم</th><th>الفرقة</th><th>المجموعة</th><th>حالة الحجز</th><th>السعر</th>${attendanceColumns}<th>المدفوع</th><th>المتبقي</th>${deleteColumn}</tr></thead><tbody>${result.items.map(s => `<tr><td>${esc(s.code)}</td><td><button class="table-link" data-student="${s.id}">${esc(s.name)}</button></td><td>${esc(s.level_name)}</td><td>${esc(s.group_name)}</td><td><span class="tag ${s.booking_status === 'cancelled' ? 'off' : ''}">${bookingLabel(s.booking_status)}</span></td><td>${moneyLabel(s.course_price_snapshot)}</td>${meta.phase.course_started ? `<td>${fmtCount(s.present)}</td><td>${fmtCount(s.absent)}</td>` : ''}<td>${moneyLabel(s.paid)}</td><td>${moneyLabel(s.remaining)}</td>${state.user.role === 'assistant' ? `<td><button class="button danger" data-delete-student="${s.id}">حذف الطالب</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : `<div class="empty"><strong>لا توجد نتائج</strong>جرّب تعديل البحث أو الفلاتر.</div>`;
  const filters = `<div class="filters"><input class="search-input" id="student-search" value="${esc(state.filters.q)}" placeholder="ابحث بالاسم أو الكود"><select id="level-filter"><option value="">كل الفرق</option>${meta.levels.map(l => `<option value="${l.id}" ${String(l.id) === state.filters.level_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><select id="group-filter"><option value="">كل المجموعات</option>${meta.groups.filter(g => !state.filters.level_id || String(g.level_id) === state.filters.level_id).map(g => `<option value="${g.id}" ${String(g.id) === state.filters.group_id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select><select id="sort-filter"><option value="name" ${state.filters.sort === 'name' ? 'selected' : ''}>ترتيب الاسم</option><option value="code" ${state.filters.sort === 'code' ? 'selected' : ''}>ترتيب الكود</option><option value="newest" ${state.filters.sort === 'newest' ? 'selected' : ''}>الأحدث</option></select>${state.user.role === 'assistant' ? `<button class="button" data-action="new-student" ${meta.phase.booking_open ? '' : 'disabled'}>إضافة حجز</button>` : ''}</div>`;
  frame(`<section class="panel"><div class="panel-head"><div><h2>قائمة الطلاب</h2><p>${fmtCount(result.total)} طالب</p></div></div>${filters}${table}<div class="pagination"><button class="button secondary" data-page="-1" ${result.page <= 1 ? 'disabled' : ''}>السابق</button><span>${fmtCount(result.page)} / ${fmtCount(Math.max(1, Math.ceil(result.total / result.size)))}</span><button class="button secondary" data-page="1" ${result.page * result.size >= result.total ? 'disabled' : ''}>التالي</button></div></section>`, 'الطلاب', 'بحث وفلترة حسب الاسم والكود والفرقة والمجموعة');
  if (meta.phase.course_started && state.user.role === 'assistant') {
    const addStudent = document.querySelector('[data-action="new-student"]');
    if (addStudent) { addStudent.disabled = false; addStudent.textContent = 'إضافة طالب'; }
  }
  document.querySelector('#student-search').addEventListener('input', debounce(event => { state.filters.q = event.target.value; state.filters.page = 1; render(); }, 250));
  document.querySelector('#level-filter').addEventListener('change', event => { state.filters.level_id = event.target.value; state.filters.group_id = ''; state.filters.page = 1; render(); });
  document.querySelector('#group-filter').addEventListener('change', event => { state.filters.group_id = event.target.value; state.filters.page = 1; render(); });
  document.querySelector('#sort-filter').addEventListener('change', event => { state.filters.sort = event.target.value; render(); });
}
function studentQuery() { const p = new URLSearchParams({ page: state.filters.page, size: 20, sort: state.filters.sort, active: 'all' }); for (const key of ['q', 'level_id', 'group_id']) if (state.filters[key]) p.set(key, state.filters[key]); return `/students?${p}`; }
function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
function refreshSessionGroups(form, meta, selectedGroupId = '') {
  const levelId = Number(form.elements.level_id.value);
  const groups = meta.groups.filter(group => group.level_id === levelId);
  const groupSelect = form.elements.group_id;
  groupSelect.innerHTML = `<option value="">${groups.length ? 'اختر المجموعة' : 'اختر الفرقة أولًا'}</option>${groups.map(group => `<option value="${group.id}" data-level="${group.level_id}">${esc(group.name)}</option>`).join('')}`;
  groupSelect.disabled = !groups.length;
  if (groups.some(group => group.id === Number(selectedGroupId))) groupSelect.value = String(selectedGroupId);
}
function refreshSessionSubjects(form, sessionOptions, selectedSubjectId = '') {
  const groupSelect = form.elements.group_id, doctorId = Number(form.elements.doctor_id.value);
  const levelId = Number(groupSelect.selectedOptions[0]?.dataset.level);
  const subjects = sessionOptions.subjects.filter(subject => subject.doctor_id === doctorId && subject.level_id === levelId);
  const subjectSelect = form.elements.subject_id;
  subjectSelect.innerHTML = `<option value="">${subjects.length ? 'اختر المادة' : 'لا توجد مواد لهذه الفرقة'}</option>${subjects.map(subject => `<option value="${subject.id}">${esc(subject.name)}</option>`).join('')}`;
  subjectSelect.disabled = !subjects.length;
  const subjectHelp = form.querySelector('[data-session-subject-help]');
  if (subjectHelp) {
    subjectHelp.textContent = subjects.length
      ? ''
      : doctorId && levelId
        ? 'لا توجد مادة لهذا الدكتور في الفرقة المختارة؛ أضف المادة من قسم المواد والاختبارات بحساب الدكتور.'
        : 'اختر الفرقة والمجموعة والدكتور لعرض المواد المتاحة.';
  }
  if (subjects.some(subject => subject.id === Number(selectedSubjectId))) subjectSelect.value = String(selectedSubjectId);
}
function setupDateTimePickers(form) {
  if (!window.flatpickr) return;
  const locale = { ...window.flatpickr.l10ns.ar, amPM: ['صباحًا', 'مساءً'], time_24hr: false };
  for (const [name, icon, label] of [['date', 'calendar-days', 'اختيار التاريخ'], ['start_time', 'calendar-clock', 'اختيار وقت البداية'], ['end_time', 'calendar-clock', 'اختيار وقت النهاية']]) {
    const input = form.elements[name];
    if (!input || input._flatpickr) continue;
    if (!input.placeholder) input.placeholder = label;
    const control = document.createElement('div'); control.className = 'date-time-picker';
    input.before(control); control.append(input);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'date-time-trigger';
    button.setAttribute('aria-label', label); button.title = label; button.innerHTML = iconSvg(icon);
    button.addEventListener('click', () => input._flatpickr?.open()); control.append(button);
    const options = { locale, allowInput: true, altInput: true, altInputClass: 'date-time-input', disableMobile: true, ariaDateFormat: 'j F Y' };
    if (name === 'date') window.flatpickr(input, { ...options, dateFormat: 'Y-m-d', altFormat: 'j F Y' });
    else window.flatpickr(input, { ...options, enableTime: true, noCalendar: true, dateFormat: 'H:i', altFormat: 'h:i K', time_24hr: false, minuteIncrement: 5 });
  }
}
async function renderSessions() {
  const [meta, sessions, sessionOptions] = await Promise.all([api('/meta'), api('/sessions'), api('/session-options')]);
  state.sessions = sessions;
  const form = state.user.role === 'assistant' ? `<form id="session-form" class="form-grid session-schedule-form"><div class="field"><label>الفرقة</label><select name="level_id" required><option value="">اختر الفرقة</option>${meta.levels.map(level => `<option value="${level.id}">${esc(level.name)}</option>`).join('')}</select></div><div class="field"><label>المجموعة</label><select name="group_id" required disabled><option value="">اختر الفرقة أولًا</option></select></div><div class="field"><label>الدكتور</label><select name="doctor_id" required ${sessionOptions.doctors.length ? '' : 'disabled'}><option value="">${sessionOptions.doctors.length ? 'اختر الدكتور' : 'لا توجد حسابات دكاترة نشطة'}</option>${sessionOptions.doctors.map(doctor => `<option value="${doctor.id}">${esc(doctor.name)}</option>`).join('')}</select></div><div class="field"><label>المادة</label><select name="subject_id" required disabled><option value="">اختر المجموعة والدكتور أولًا</option></select><small class="field-hint" data-session-subject-help>اختر الفرقة والمجموعة والدكتور لعرض المواد المتاحة.</small></div><div class="field"><label>التاريخ</label><input name="date" type="date" required value="${esc(state.today)}" placeholder="اختر التاريخ"></div><div class="field"><label>وقت البداية</label><input name="start_time" type="time" required placeholder="اختر وقت البداية"></div><div class="field"><label>وقت النهاية</label><input name="end_time" type="time" required placeholder="اختر وقت النهاية"></div><div class="field wide"><label>عنوان المحاضرة</label><input name="title" required value="محاضرة الكورس"></div><div class="wide"><button class="button">إضافة محاضرة</button></div></form>` : '<div class="notice">عرض فقط. إدارة المواعيد متاحة لدنيا.</div>';
  const statusLabels = { scheduled: 'مجدولة', started: 'بدأت', ended: 'انتهت', cancelled: 'ملغاة' };
  frame(`<section class="panel"><div class="panel-head"><div><h2>جدول المحاضرات</h2><p>${meta.phase.course_started ? 'المحاضرات مفعّلة.' : 'يمكن تجهيز الجدول الآن؛ الحضور لا يبدأ قبل موعد بداية الكورس.'}</p></div></div>${form}</section><section class="panel"><div class="panel-head"><h2>المواعيد المسجلة</h2></div>${sessions.length ? `<div class="table-scroll"><table><thead><tr><th>التاريخ</th><th>الوقت</th><th>الفرقة</th><th>المجموعة</th><th>المادة</th><th>الدكتور</th><th>عنوان المحاضرة</th><th>الحالة</th>${state.user.role === 'assistant' ? '<th>إجراء</th>' : ''}</tr></thead><tbody>${sessions.map(s => `<tr><td>${dateLabel(s.date)}</td><td>${s.start_time ? timeLabel(s.start_time) : '—'}${s.end_time ? `–${timeLabel(s.end_time)}` : ''}</td><td>${esc(s.level_name)}</td><td>${esc(s.group_name)}</td><td>${esc(s.subject_name || '—')}</td><td>${esc(s.doctor_name || '—')}</td><td>${esc(s.title)}</td><td><span class="tag ${s.status === 'cancelled' ? 'off' : ''}">${statusLabels[s.status]}</span></td>${state.user.role === 'assistant' ? `<td><button class="button secondary" data-session-edit="${s.id}">تعديل</button> <button class="button secondary" data-session="${s.id}" data-cancelled="${s.cancelled ? 0 : 1}">${s.cancelled ? 'استعادة' : 'إلغاء'}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>لا توجد محاضرات</strong>ستظهر الجلسات الفعلية التي تنشئها دنيا هنا.</div>'}</section>`, 'أيام المحاضرات', state.user.role === 'assistant' ? 'إدارة مواعيد الجلسات' : 'مشاهدة مواعيد المحاضرات وحالتها');
  if (state.user.role === 'assistant') {
    const sessionForm = document.querySelector('#session-form');
    const updateSubjects = () => refreshSessionSubjects(sessionForm, sessionOptions);
    sessionForm.elements.level_id.addEventListener('change', () => {
      refreshSessionGroups(sessionForm, meta);
      updateSubjects();
    });
    sessionForm.elements.doctor_id.addEventListener('change', updateSubjects);
    sessionForm.elements.group_id.addEventListener('change', updateSubjects);
    refreshSessionGroups(sessionForm, meta);
    updateSubjects();
    setupDateTimePickers(sessionForm);
    sessionForm.addEventListener('submit', createSession);
  }
}
async function renderReports() {
  const meta = await api('/meta');
  const dailyOption = state.user.role === 'assistant' ? '<option value="daily">التقرير اليومي للمساعد</option>' : '';
  frame(`<section class="panel"><div class="panel-head"><div><h2>إنشاء كشف</h2><p>يمكنك الطباعة أو تنزيل ملف Excel أو PDF.</p></div></div><form id="report-form" class="form-grid"><div class="field"><label>نوع الكشف</label><select name="type">${dailyOption}<option value="students">الطلاب والأرصدة</option><option value="attendance">الحضور</option><option value="payments">المدفوعات</option></select></div><div class="field"><label>التاريخ</label><input name="date" type="date" value="${esc(state.today)}"></div><div class="field"><label>الفرقة</label><select name="level_id"><option value="">كل الفرق</option>${meta.levels.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>المجموعة</label><select name="group_id"><option value="">كل المجموعات</option>${meta.groups.map(g => `<option value="${g.id}" data-level="${g.level_id}">${esc(g.name)}</option>`).join('')}</select></div><div class="form-actions wide"><button class="button">عرض الكشف</button><button type="button" class="button secondary" data-action="print-report">طباعة</button><button type="button" class="button secondary" data-export="xlsx">Excel</button><button type="button" class="button secondary" data-export="pdf">PDF</button></div></form></section><section id="report-result"></section>`, 'التقارير', 'كشوف الحضور والطلاب والمدفوعات');
  const form = document.querySelector('#report-form');   form.addEventListener('change', event => { if (event.target.name === 'level_id') { [...form.elements.group_id.options].forEach(option => { option.hidden = Boolean(event.target.value && option.dataset.level && option.dataset.level !== event.target.value); }); if (form.elements.group_id.value && form.elements.group_id.selectedOptions[0]?.hidden) form.elements.group_id.value = ''; } }); form.addEventListener('submit', showReport);
  form.querySelector('[data-action="print-report"]').addEventListener('click', () => window.print());
}
function reportParams() { const form = new FormData(document.querySelector('#report-form')), params = new URLSearchParams(); for (const [k, v] of form) if (v) params.set(k, v); return params; }
async function showReport(event) {
  event.preventDefault(); const result = document.querySelector('#report-result'); result.innerHTML = '<section class="panel"><div class="spinner"></div></section>';
  try {
    const data = await api(`/reports?${reportParams()}`);
    if (data.sections) {
      const summary = [
        ['عدد المحاضرات', data.summary.session_count],
        ['الطلاب المتوقع حضورهم', data.summary.scheduled],
        ['الحضور', data.summary.present],
        ['الغياب', data.summary.absent],
        ['عدد الدفعات', data.summary.payment_count],
        ['إجمالي المدفوع', `${moneyLabel(data.summary.payment_total * 100)}`]
      ];
      const summaryCards = `<section class="grid stats">${summary.map(([label, value]) => `<article class="stat"><span>${label}</span><strong>${typeof value === 'number' ? fmtCount(value) : value}</strong></article>`).join('')}</section>`;
      const sections = data.sections.map(section => `<section class="panel"><div class="panel-head"><div><h2>${esc(section.title)}</h2><p>${fmtCount(section.rows.length)} سجل</p></div></div>${section.rows.length ? `<div class="table-scroll"><table><thead><tr>${section.headings.map(heading => `<th>${esc(heading)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد سجلات لهذا اليوم.</div>'}</section>`).join('');
      result.innerHTML = `<section class="panel"><div class="panel-head"><div><h2>${esc(data.title)}</h2><p>${dateLabel(data.date)}</p></div></div></section>${summaryCards}${sections}<p class="muted">${esc(data.note)}</p>`;
    } else {
      result.innerHTML = `<section class="panel"><div class="panel-head"><div><h2>${esc(data.title)}</h2><p>${dateLabel(data.date)} · ${fmtCount(data.rows.length)} سجل</p></div></div>${data.rows.length ? `<div class="table-scroll"><table><thead><tr>${data.headings.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>لا توجد نتائج</strong>لا توجد سجلات مطابقة للاختيارات.</div>'}</section>`;
    }
  } catch (error) { result.innerHTML = `<section class="panel"><div class="notice error">${esc(error.message)}</div></section>`; }
}
async function exportReport(format) {
  if (format === 'pdf') {
    const link = Object.assign(document.createElement('a'), {
      href: `/api/reports/export?${reportParams()}&format=pdf`,
      download: 'course-report.pdf'
    });
    document.body.append(link);
    link.click();
    link.remove();
    return;
  }
  try { const params = reportParams(), response = await fetch(`/api/reports/export?${params}&format=${format}`, { credentials: 'same-origin' }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'تعذر تنزيل التقرير'); const blob = await response.blob(), url = URL.createObjectURL(blob), a = Object.assign(document.createElement('a'), { href: url, download: params.get('type') === 'daily' ? `daily-report-${params.get('date')}.xlsx` : 'course-report.xlsx' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  catch (error) { toast(error.message, true); }
}
function datetimeLocalValue(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = type => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
async function renderSettings() {
  const meta = await api('/meta'), settings = meta.course_settings;
  const configuredPrices = new Map(meta.course_prices.map(item => [item.level_id, item.price]));
  const prices = meta.levels.map(level => {
    const price = configuredPrices.get(level.id);
    return `<div class="price-row"><label for="level-price-${level.id}">${esc(level.name)}</label><div class="price-control"><input id="level-price-${level.id}" name="price_${level.id}" inputmode="decimal" min="0" step="0.01" required value="${price === undefined ? '' : (price / 100).toFixed(2)}" placeholder="أدخل سعر هذه الفرقة"><span>جنيه</span></div></div>`;
  }).join('');
  const priceContent = prices || '<div class="empty">أضف الفرق أولًا، ثم حدّد سعرًا مستقلًا لكل فرقة.</div>';
  frame(`<div class="notice">${meta.phase.course_started ? `${iconSvg('graduation-cap')} الكورس بدأ` : `${meta.phase.booking_open ? `${iconSvg('book-open')} الحجز مفتوح` : 'الحجز مغلق'} — المحاضرات لم تبدأ بعد`}</div><section class="panel"><div class="panel-head"><div><h2>أسعار الكورس حسب الفرقة</h2><p>لكل فرقة سعر مستقل. أدخل سعر كل فرقة على حدة؛ لا يُستخدم سعر موحد تلقائيًا. السعر الجديد يطبق على الحجوزات الجديدة فقط، ويحتفظ كل طالب بسعره وقت الحجز.</p></div></div><form id="level-prices-form"><div class="price-list">${priceContent}</div>${prices ? '<button class="button" style="margin-top:16px">حفظ أسعار الفرق</button>' : ''}</form></section><section class="panel"><div class="panel-head"><div><h2>الحجز وبداية الكورس</h2><p>قبل البداية تتاح الحجوزات والدفعات، ويظل الحضور معطلًا.</p></div></div><form id="course-settings-form" class="form-grid"><div class="field"><label for="booking-open">الحجز</label><select id="booking-open" name="booking_open"><option value="true" ${settings.booking_open ? 'selected' : ''}>مفتوح</option><option value="false" ${!settings.booking_open ? 'selected' : ''}>مغلق</option></select></div><div class="field"><label for="booking-start">بداية الحجز</label><input id="booking-start" name="booking_starts_at" type="datetime-local" value="${datetimeLocalValue(settings.booking_starts_at)}"></div><div class="field"><label for="booking-end">نهاية الحجز</label><input id="booking-end" name="booking_ends_at" type="datetime-local" value="${datetimeLocalValue(settings.booking_ends_at)}"></div><div class="field"><label for="course-start">بداية الكورس</label><input id="course-start" name="course_starts_at" type="datetime-local" value="${datetimeLocalValue(settings.course_starts_at)}"></div><div class="form-actions wide"><button class="button">حفظ المواعيد</button></div></form></section>`, 'الإعدادات', 'إعداد أسعار الفرق ومواعيد مراحل الكورس');
  document.querySelector('#level-prices-form').addEventListener('submit', saveLevelPrices);
  document.querySelector('#course-settings-form').addEventListener('submit', saveCourseSettings);
}
async function saveLevelPrices(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), button = event.currentTarget.querySelector('button'); setBusy(button, true);
  try {
    const meta = await api('/meta');
    for (const level of meta.levels) await api(`/course/prices/${level.id}`, { method: 'PATCH', body: JSON.stringify({ price: form.get(`price_${level.id}`) }) });
    toast('تم حفظ أسعار الفرق. الأسعار المحفوظة للحجوزات السابقة لم تتغير.'); await renderSettings();
  } catch (error) { toast(error.message, true); setBusy(button, false); }
}
async function saveCourseSettings(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), button = event.currentTarget.querySelector('button'); setBusy(button, true);
  const toIso = value => value ? new Date(value).toISOString() : null;
  try {
    await api('/course/settings', { method: 'PATCH', body: JSON.stringify({ booking_open: form.get('booking_open') === 'true',
      booking_starts_at: toIso(form.get('booking_starts_at')), booking_ends_at: toIso(form.get('booking_ends_at')),
      course_starts_at: toIso(form.get('course_starts_at')) }) });
    toast('تم حفظ إعدادات الحجز والكورس'); await renderSettings();
  } catch (error) { toast(error.message, true); setBusy(button, false); }
}
async function renderUsers() {
  const meta = await api('/meta');
  const users = state.user.role === 'admin' ? await api('/users') : [];
  const structurePanel = `<section class="panel"><div class="panel-head"><div><h2>إدارة الفرق والمجموعات</h2><p>المجموعات مرتبطة بفرقتها؛ لا يمكن حذف مجموعة مستخدمة.</p></div></div><div class="grid level-grid"><form id="level-form" class="form-grid"><h3 class="wide">إضافة فرقة</h3><div class="field wide"><label>اسم الفرقة</label><input name="name" required minlength="2"></div><div class="wide"><button class="button">إضافة الفرقة</button></div></form><form id="group-form" class="form-grid"><h3 class="wide">إضافة مجموعة</h3><div class="field"><label>الفرقة</label><select name="level_id">${meta.levels.map(level => `<option value="${level.id}">${esc(level.name)}</option>`).join('')}</select></div><div class="field"><label>اسم المجموعة</label><input name="name" required minlength="2"></div><div class="wide"><button class="button">إضافة المجموعة</button></div></form></div><div class="table-scroll" style="margin-top:16px"><table><thead><tr><th>النوع</th><th>الفرقة</th><th>الاسم</th><th>إجراءات</th></tr></thead><tbody>${meta.levels.map(level => `<tr><td>فرقة</td><td>—</td><td>${esc(level.name)}</td><td><button class="button secondary" data-structure-edit="levels" data-id="${level.id}" data-name="${esc(level.name)}">تسمية</button> <button class="button danger" data-structure-delete="levels" data-id="${level.id}">حذف</button></td></tr>${meta.groups.filter(group => group.level_id === level.id).map(group => `<tr><td>مجموعة</td><td>${esc(level.name)}</td><td>${esc(group.name)}</td><td><button class="button secondary" data-structure-edit="groups" data-id="${group.id}" data-name="${esc(group.name)}">تسمية</button> <button class="button danger" data-structure-delete="groups" data-id="${group.id}">حذف</button></td></tr>`).join('')}`).join('')}</tbody></table></div></section>`;
  if (state.user.role === 'assistant') {
    frame(`<section class="panel"><div class="panel-head"><div><h2>إعدادات الكورس</h2><p>أعد إدخال بيانات الكورس الأساسية بعد المسح الشامل. السعر في هذه الشاشة مرجعي فقط؛ سعر الحجز يضبط بشكل مستقل لكل فرقة من شاشة الإعدادات.</p></div></div><form id="course-form" class="form-grid"><div class="field"><label>اسم الكورس</label><input name="name" required value="${esc(meta.course.name)}"></div><div class="field"><label>السعر المرجعي بالجنيه (لا يحدد سعر الفرقة)</label><input name="price" inputmode="decimal" min="0" step="0.01" required value="${(meta.course.price / 100).toFixed(2)}"></div><div class="form-actions wide"><button class="button">حفظ الإعدادات</button></div></form></section>${structurePanel}`, 'الفرق والإعدادات', 'إعادة إنشاء الهيكل الأساسي للكورس');
    document.querySelector('#course-form').addEventListener('submit', saveCourse);
    document.querySelector('#level-form').addEventListener('submit', createStructure);
    document.querySelector('#group-form').addEventListener('submit', createStructure);
    return;
  }
  frame(`<section class="panel"><div class="panel-head"><div><h2>إعدادات الكورس</h2><p>السعر الافتراضي للطلاب الجدد فقط.</p></div></div><form id="course-form" class="form-grid"><div class="field"><label>اسم الكورس</label><input name="name" required value="${esc(meta.course.name)}"></div><div class="field"><label>السعر الافتراضي بالجنيه</label><input name="price" inputmode="decimal" min="0" step="0.01" required value="${(meta.course.price / 100).toFixed(2)}"></div><div class="form-actions wide"><button class="button">حفظ الإعدادات</button></div></form></section><section class="panel"><div class="panel-head"><div><h2>حسابات الإدارة والمساعدة</h2><p>تعطيل الحساب ينهي جلساته المفتوحة.</p></div></div><div class="table-scroll"><table><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الدور</th><th>الحالة</th><th>تغيير سعر الطالب</th><th>إجراءات</th></tr></thead><tbody>${users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td>${u.role === 'admin' ? 'إدارة' : 'مساعدة'}</td><td><span class="tag ${u.active ? '' : 'off'}">${u.active ? 'نشط' : 'معطل'}</span></td><td>${u.role === 'assistant' ? `<input type="checkbox" data-permission="${u.id}" ${u.can_set_price ? 'checked' : ''} aria-label="السماح بتغيير سعر الطالب">` : '—'}</td><td>${u.role === 'assistant' ? `<button class="button secondary" data-user-toggle="${u.id}" data-active="${u.active ? 0 : 1}">${u.active ? 'تعطيل' : 'تفعيل'}</button> <button class="button secondary" data-user-password="${u.id}">تعيين كلمة مرور</button>` : '—'}</td></tr>`).join('')}</tbody></table></div></section>${structurePanel}`, 'الحسابات', 'إعدادات الكورس والحسابات والهيكل الدراسي');
  document.querySelector('#course-form').addEventListener('submit', saveCourse);
  document.querySelector('#level-form').addEventListener('submit', createStructure);
  document.querySelector('#group-form').addEventListener('submit', createStructure);
}
async function createStructure(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), type = event.currentTarget.id === 'level-form' ? 'levels' : 'groups', body = Object.fromEntries(form), button = event.currentTarget.querySelector('button');
  if (body.level_id) body.level_id = Number(body.level_id);
  setBusy(button, true);
  try { await api(`/structure/${type}`, { method: 'POST', body: JSON.stringify(body) }); toast('تمت إضافة الهيكل الدراسي'); await renderUsers(); }
  catch (error) { toast(error.message, true); setBusy(button, false); }
}
async function editStructure(type, id, oldName) {
  const name = prompt('أدخل الاسم الجديد:', oldName); if (name === null || !name.trim()) return;
  try { await api(`/structure/${type}/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }); toast('تم تحديث الاسم'); await renderUsers(); }
  catch (error) { toast(error.message, true); }
}
async function deleteStructure(type, id) {
  if (!confirm('هل تريد حذف هذا السجل؟ لا يمكن حذف عنصر مرتبط بطلاب أو محاضرات.')) return;
  try { await api(`/structure/${type}/${id}`, { method: 'DELETE' }); toast('تم الحذف'); await renderUsers(); }
  catch (error) { toast(error.message, true); }
}
async function saveCourse(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), button = event.currentTarget.querySelector('button'); setBusy(button, true);
  try { await api('/course', { method: 'PATCH', body: JSON.stringify({ name: form.get('name'), price: form.get('price') }) }); toast('تم حفظ إعدادات الكورس'); await renderUsers(); }
  catch (error) { toast(error.message, true); setBusy(button, false); }
}
async function renderAudit() {
  const data = await api('/audit');
  frame(`<section class="panel"><div class="panel-head"><div><h2>سجل العمليات</h2><p>${fmtCount(data.total)} عملية مسجلة</p></div></div>${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>النوع</th><th>رقم السجل</th><th>التفاصيل</th></tr></thead><tbody>${data.items.map(row => `<tr><td>${datetimeLabel(row.created_at)}</td><td>${esc(row.actor_name)}</td><td>${esc(row.action)}</td><td>${esc(row.entity)}</td><td>${esc(row.entity_id || '—')}</td><td>${esc(auditSummary(row))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد عمليات مسجلة بعد.</div>'}</section>`, 'سجل العمليات', 'العمليات الإدارية والمالية المسجلة');
}
function auditSummary(row) {
  let details = {};
  try { details = JSON.parse(row.details || '{}'); } catch { return 'تم تسجيل العملية'; }
  const person = details.name ? ` للطالب ${details.name}` : '';
  if (row.action === 'إنشاء طالب') return `تم تسجيل الطالب ${details.name || ''}، الكود ${details.code || ''}`;
  if (row.action === 'تسجيل دفعة') return `تم تسجيل دفعة ${moneyLabel(details.amount)}${person}`;
  if (row.action === 'إلغاء دفعة') return `تم إلغاء دفعة ${moneyLabel(details.amount)}${person}`;
  if (row.action === 'إرسال تذكير دفع داخل الموقع') return `تم إرسال تذكير بالمتبقي ${moneyLabel(details.remaining)}${person}`;
  if (row.action === 'تسجيل حضور') return `تم تسجيل الحضور${person}`;
  if (row.action === 'تصحيح حضور إلى غياب') return `تم تصحيح الحضور إلى غياب. السبب: ${details.reason || '—'}`;
  if (row.action === 'إضافة محاضرة') return `تمت إضافة ${details.title || 'محاضرة'} بتاريخ ${dateLabel(details.day)}`;
  if (row.action === 'تعديل سعر الفرقة') return `تم تحديث سعر الفرقة إلى ${moneyLabel(details.after)}`;
  if (row.action.includes('إلغاء محاضرة')) return 'تم إلغاء المحاضرة';
  if (row.action === 'تغيير كلمة المرور' || row.action.includes('كلمة مرور')) return 'تم تحديث بيانات كلمة المرور';
  return `تم ${row.action || 'تسجيل العملية'}`;
}
async function showExamResults(examId, query = {}) {
  try {
    const params=new URLSearchParams({tab:query.tab||'attempted',page:query.page||1,size:20});
    for(const key of ['q','status','integrity'])if(query[key])params.set(key,query[key]);
    const data=await api(`/academic/exams/${examId}/results?${params}`);
    const rows=data.items.map(item=>`<tr><td>${esc(item.name)}</td><td>${esc(item.code)}</td><td>${esc(item.level_name)} · ${esc(item.group_name)}</td><td>${item.started_at?datetimeLabel(item.started_at):'—'}</td><td>${item.submitted_at?datetimeLabel(item.submitted_at):'لم يسلّم'}</td><td>${fmtCount(Math.floor(item.duration_seconds/60))}:${String(item.duration_seconds%60).padStart(2,'0')}</td><td>${item.attempt_id?`${fmtCount(item.score)} / ${fmtCount(item.total_questions)} (${fmtCount(Math.round(item.percentage))}%)`:'—'}</td><td>${fmtCount(item.correct_answers)} / ${fmtCount(item.wrong_answers)}</td><td>${fmtCount(item.leave_count)} · ${fmtCount(item.away_seconds)}ث</td><td>${{normal:'طبيعي',review:'يحتاج مراجعة',high:'مؤشرات مرتفعة'}[item.integrity_status]}</td><td>${['submitted','timed_out'].includes(item.status)?`<button class="button secondary" data-exam-certificate="${item.attempt_id}" data-exam-certificate-sent="${item.exam_certificate_id?'true':'false'}">${item.exam_certificate_id?'إعادة إرسال الشهادة':'إرسال شهادة الاختبار'}</button>`:'—'}</td></tr>`).join('');
    const pageCount=Math.max(1,Math.ceil(data.total/data.size));
    frame(`<section class="panel"><div class="panel-head"><div><h2>نتائج: ${esc(data.exam.title)}</h2><p>${fmtCount(data.total)} طالب</p></div><button class="button secondary" data-route="academic">عودة للمحتوى الأكاديمي</button></div><div class="filters"><button class="button ${data.tab==='attempted'?'':'secondary'}" data-results-tab="attempted" data-exam="${examId}">أدّوا الاختبار</button><button class="button ${data.tab==='missing'?'':'secondary'}" data-results-tab="missing" data-exam="${examId}">لم يؤدوا الاختبار</button><input class="search-input" id="exam-result-search" value="${esc(query.q||'')}" placeholder="بحث بالاسم أو الكود"><select id="exam-result-status"><option value="">كل الحالات</option><option value="in_progress" ${query.status==='in_progress'?'selected':''}>جارٍ</option><option value="submitted" ${query.status==='submitted'?'selected':''}>تم التسليم</option><option value="timed_out" ${query.status==='timed_out'?'selected':''}>انتهى الوقت</option></select><select id="exam-result-integrity"><option value="">كل مؤشرات النزاهة</option><option value="normal" ${query.integrity==='normal'?'selected':''}>طبيعي</option><option value="review" ${query.integrity==='review'?'selected':''}>يحتاج مراجعة</option><option value="high" ${query.integrity==='high'?'selected':''}>مؤشرات مرتفعة</option></select></div>${rows?`<div class="table-scroll"><table><thead><tr><th>الطالب</th><th>الكود</th><th>الفرقة والمجموعة</th><th>البداية</th><th>التسليم</th><th>المدة</th><th>النتيجة</th><th>صح / خطأ</th><th>المغادرات / الثواني</th><th>النزاهة</th><th>شهادة</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty">لا توجد نتائج مطابقة.</div>'}<div class="pagination"><button class="button secondary" data-results-page="-1" data-exam="${examId}" ${data.page<=1?'disabled':''}>السابق</button><span>${fmtCount(data.page)} / ${fmtCount(pageCount)}</span><button class="button secondary" data-results-page="1" data-exam="${examId}" ${data.page>=pageCount?'disabled':''}>التالي</button></div></section>`, 'نتائج الاختبار', `${esc(data.exam.title)} · نتائج هذا الدكتور فقط`);
    if(data.tab==='missing'){document.querySelector('#exam-result-status').disabled=true;document.querySelector('#exam-result-integrity').disabled=true;}
    document.querySelector('#exam-result-search').addEventListener('input',debounce(event=>showExamResults(examId,{...query,q:event.target.value,page:1}),300));
    document.querySelector('#exam-result-status').addEventListener('change',event=>showExamResults(examId,{...query,status:event.target.value,page:1}));
    document.querySelector('#exam-result-integrity').addEventListener('change',event=>showExamResults(examId,{...query,integrity:event.target.value,page:1}));
  } catch(error){frame(`<section class="panel"><div class="notice error">${esc(error.message)}</div></section>`,'تعذر تحميل النتائج');}
}
function examResultFilters(page=1,tab){
  const selectedTab=tab||[...document.querySelectorAll('[data-results-tab]')].find(button=>!button.classList.contains('secondary'))?.dataset.resultsTab||'attempted';
  return {page,tab:selectedTab,q:document.querySelector('#exam-result-search')?.value||'',status:document.querySelector('#exam-result-status')?.value||'',integrity:document.querySelector('#exam-result-integrity')?.value||''};
}
async function renderAcademic() {
  const [dashboard, subjects, lectures, exams, meta] = await Promise.all([
    api('/academic/dashboard'), api('/academic/subjects?page=1&size=50'),
    api('/academic/lectures?page=1&size=50'), api('/academic/exams?page=1&size=50'), api('/meta')
  ]);
  const stats = [['المواد',dashboard.subjects],['المحاضرات',dashboard.lectures],['الاختبارات',dashboard.exams],
    ['أدّوا اختبارات',dashboard.students_completed],['لم يؤدوا',dashboard.students_not_taken]];
  const subjectRows = subjects.items.map(subject => `<tr><td>${esc(subject.name)}</td><td>${esc(subject.level_name)}</td><td>${fmtCount(subject.lecture_count)}</td></tr>`).join('');
  const lectureRows = lectures.items.map(lecture => `<tr><td>${dateLabel(lecture.lecture_date)}</td><td>${esc(lecture.subject_name)}</td><td>${esc(lecture.title)}</td><td>${esc(lecture.topic)}</td><td>${esc(lecture.level_name)} · ${esc(lecture.group_name)}</td><td>${lecture.start_time ? timeLabel(lecture.start_time) : '—'}–${lecture.end_time ? timeLabel(lecture.end_time) : '—'}</td><td>${{scheduled:'مجدولة',started:'بدأت',completed:'انتهت',cancelled:'ملغاة'}[lecture.status]}</td><td>${fmtCount(lecture.exam_count)}</td><td><button class="button secondary" data-lecture-edit="${lecture.id}">تعديل</button> <button class="button secondary" data-exam-lecture="${lecture.id}">إنشاء اختبار</button></td></tr>`).join('');
  const examRows = exams.items.map(exam => `<tr><td>${esc(exam.title)}</td><td>${esc(exam.subject_name)}</td><td>${esc(exam.lecture_title)}</td><td>${fmtCount(exam.question_pool_size)} / ${fmtCount(exam.question_count)}</td><td>${fmtCount(exam.duration_minutes)} دقيقة</td><td>${fmtCount(exam.attempt_count)} أدّوا</td><td>${exam.average_percentage===null?'—':`${fmtCount(Math.round(exam.average_percentage))}%`}</td><td>${{draft:'مسودة',published:'منشور',closed:'مغلق'}[exam.status]}</td><td><button class="button secondary" data-exam-edit="${exam.id}">إدارة</button> <button class="button secondary" data-exam-results="${exam.id}">النتائج</button> ${exam.status==='published'?`<button class="button secondary" data-exam-share="${exam.id}">مشاركة</button>`:''}</td></tr>`).join('');
  frame(`<section class="grid stats">${stats.map(([label,value])=>`<article class="stat"><span>${label}</span><strong>${fmtCount(value)}</strong></article>`).join('')}</section>
    <section class="panel"><div class="panel-head"><div><h2>موادي</h2><p>المواد التي تملكها أنت فقط</p></div></div><form id="subject-form" class="form-grid"><div class="field"><label>اسم المادة</label><input name="name" required minlength="2" maxlength="120"></div><div class="field"><label>الفرقة</label><select name="level_id" required>${meta.levels.map(level=>`<option value="${level.id}">${esc(level.name)}</option>`).join('')}</select></div><div class="form-actions wide"><button class="button">إضافة مادة</button></div></form>${subjectRows?`<div class="table-scroll"><table><thead><tr><th>المادة</th><th>الفرقة</th><th>المحاضرات</th></tr></thead><tbody>${subjectRows}</tbody></table></div>`:'<div class="empty">لا توجد مواد مسجلة.</div>'}</section>
    <section class="panel"><div class="panel-head"><div><h2>محاضراتي</h2><p>كل محاضرة ترتبط بمادة وفرقة ومجموعة وجلسة حضور</p></div></div><form id="lecture-form" class="form-grid"><div class="field"><label>المادة</label><select name="subject_id" required>${subjects.items.map(subject=>`<option value="${subject.id}" data-level="${subject.level_id}">${esc(subject.name)} · ${esc(subject.level_name)}</option>`).join('')}</select></div><div class="field"><label>المجموعة</label><select name="group_id" required>${meta.groups.map(group=>`<option value="${group.id}" data-level="${group.level_id}">${esc(meta.levels.find(level=>level.id===group.level_id)?.name)} · ${esc(group.name)}</option>`).join('')}</select></div><div class="field"><label>عنوان المحاضرة</label><input name="title" required minlength="2" maxlength="160"></div><div class="field"><label>الموضوع</label><input name="topic" maxlength="2000"></div><div class="field"><label>التاريخ</label><input name="date" type="date" value="${esc(state.today)}" required></div><div class="field"><label>وقت البداية</label><input name="start_time" type="time" required></div><div class="field"><label>وقت النهاية</label><input name="end_time" type="time" required></div><div class="form-actions wide"><button class="button">إنشاء محاضرة</button></div></form>${lectureRows?`<div class="table-scroll"><table><thead><tr><th>التاريخ</th><th>المادة</th><th>المحاضرة</th><th>الموضوع</th><th>الفرقة والمجموعة</th><th>الوقت</th><th>الحالة</th><th>اختبارات</th><th>إجراء</th></tr></thead><tbody>${lectureRows}</tbody></table></div>`:'<div class="empty">لا توجد محاضرات.</div>'}</section>
    <section class="panel"><div class="panel-head"><div><h2>اختباراتي</h2><p>مخزون الأسئلة، النشر، النتائج ومؤشرات النزاهة</p></div></div>${examRows?`<div class="table-scroll"><table><thead><tr><th>الاختبار</th><th>المادة</th><th>المحاضرة</th><th>المخزون / المطلوب</th><th>المدة</th><th>المحاولات</th><th>متوسط النتيجة</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${examRows}</tbody></table></div>`:'<div class="empty">لا توجد اختبارات.</div>'}</section>`, 'المواد والاختبارات', 'المحتوى الأكاديمي الخاص بحسابك');
  document.querySelector('#subject-form').addEventListener('submit',createAcademicSubject);
  document.querySelector('#lecture-form').addEventListener('submit',createAcademicLecture);
  const lectureForm=document.querySelector('#lecture-form');
  setupDateTimePickers(lectureForm);
  lectureForm.elements.subject_id.addEventListener('change',()=>{
    const selectedSubject=lectureForm.elements.subject_id.selectedOptions[0];
    const submitButton=lectureForm.querySelector('button');
    if(!selectedSubject){submitButton.disabled=true;return;}
    submitButton.disabled=false;
    const level=selectedSubject.dataset.level;
    [...lectureForm.elements.group_id.options].forEach(option=>{option.hidden=option.dataset.level!==level;});
    if(lectureForm.elements.group_id.selectedOptions[0]?.hidden) lectureForm.elements.group_id.value=lectureForm.querySelector(`option[data-level="${level}"]`)?.value||'';
  });
  lectureForm.elements.subject_id.dispatchEvent(new Event('change'));
}
async function renderLibrary() {
  const student = state.user.role === 'student';
  const meta = student ? null : await Promise.all([
    api('/meta'), api('/academic/subjects?page=1&size=100')
  ]);
  const [levels, ownedSubjects] = student ? [[], []] : meta;
  const query = new URLSearchParams();
  if (student) {
    if (state.libraryFilters.subject_id) query.set('subject_id', state.libraryFilters.subject_id);
  } else {
    if (state.libraryFilters.level_id) query.set('level_id', state.libraryFilters.level_id);
    if (state.libraryFilters.subject_id) query.set('subject_id', state.libraryFilters.subject_id);
  }
  const queryString = query.toString();
  const data = await api(`${student ? '/student/library' : '/academic/library'}${queryString ? `?${queryString}` : ''}`);
  const cards = data.items.map(item => `<article class="exam-list-item"><div><strong>${esc(item.subject_name)} · ${esc(item.title)}</strong><span>${esc(item.file_name)} · ${(item.file_size / 1024 / 1024).toFixed(1)} م.ب · ${dateLabel(item.created_at.slice(0, 10))}${student ? ` · ${esc(item.doctor_name)}` : ''}</span>${item.description ? `<p>${esc(item.description)}</p>` : ''}</div><div class="filters"><a class="button secondary" href="${student ? `/api/student/library/${item.id}/file` : `/api/academic/library/${item.id}/file`}" target="_blank" rel="noopener">فتح الملف</a><button class="button secondary" data-library-share="${item.id}">مشاركة الرابط</button>${!student && item.is_mine ? `<button class="button danger" data-library-delete="${item.id}">حذف</button>` : ''}</div></article>`).join('');
  const subjectFilter = `<select id="library-subject-filter"><option value="">كل المواد</option>${data.subjects.map(subject => `<option value="${subject.id}" ${String(subject.id) === state.libraryFilters.subject_id ? 'selected' : ''}>${esc(subject.name)}${student ? '' : ` · ${esc(subject.level_name)}`}</option>`).join('')}</select>`;
  if (student) {
    frame(`<section class="panel"><div class="panel-head"><div><h2>مكتبة المحاضرات</h2><p>ملفات مواد فرقتك متاحة لكل مجموعاتها</p></div></div><div class="filters">${subjectFilter}</div><div class="notification-list">${cards || '<div class="empty"><strong>لا توجد ملفات بعد</strong>ستظهر هنا أوراق المحاضرات التي يضيفها الدكاترة لمواد فرقتك.</div>'}</div></section>`, 'مكتبة المحاضرات', 'المواد والملفات المشتركة لطلاب فرقتك');
    document.querySelector('#library-subject-filter').addEventListener('change', event => {
      state.libraryFilters.subject_id = event.target.value;
      renderLibrary();
    });
    return;
  }
  const ownSubjectOptions = ownedSubjects.items.map(subject => `<option value="${subject.id}">${esc(subject.name)} · ${esc(subject.level_name)}</option>`).join('');
  const levelFilter = `<select id="library-level-filter"><option value="">كل الفرق</option>${levels.levels.map(level => `<option value="${level.id}" ${String(level.id) === state.libraryFilters.level_id ? 'selected' : ''}>${esc(level.name)}</option>`).join('')}</select>`;
  frame(`<section class="panel"><div class="panel-head"><div><h2>مكتبة المحاضرات</h2><p>ارفع أوراق المحاضرات لتظهر لكل طلاب الفرقة، مع تصنيفها حسب المادة</p></div></div><form id="library-upload-form" class="form-grid"><div class="field"><label for="library-title">عنوان الملف</label><input id="library-title" name="title" required minlength="2" maxlength="160"></div><div class="field"><label for="library-upload-subject">المادة</label><select id="library-upload-subject" name="subject_id" required>${ownSubjectOptions || '<option value="">أضف مادة أولًا من صفحة المواد والاختبارات</option>'}</select></div><div class="field wide"><label for="library-description">وصف (اختياري)</label><textarea id="library-description" name="description" maxlength="1000"></textarea></div><div class="field wide"><label for="library-file">ملف PDF أو صورة JPG / PNG (حتى 20 ميجابايت)</label><input id="library-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required></div><div class="form-actions wide"><button class="button" type="submit" ${ownedSubjects.items.length ? '' : 'disabled'}>رفع الملف للمكتبة</button></div></form></section><section class="panel"><div class="panel-head"><div><h2>الملفات المضافة</h2><p>${fmtCount(data.items.length)} ملف</p></div></div><div class="filters">${levelFilter}${subjectFilter}</div><div class="notification-list">${cards || '<div class="empty"><strong>لا توجد ملفات في هذا الاختيار</strong>اختر فرقة أو مادة أخرى، أو ارفع ملفًا جديدًا.</div>'}</div></section>`, 'مكتبة المحاضرات', 'إدارة الملفات المشتركة لكل فرقة');
  document.querySelector('#library-level-filter').addEventListener('change', event => {
    state.libraryFilters.level_id = event.target.value;
    state.libraryFilters.subject_id = '';
    renderLibrary();
  });
  document.querySelector('#library-subject-filter').addEventListener('change', event => {
    state.libraryFilters.subject_id = event.target.value;
    renderLibrary();
  });
  document.querySelector('#library-upload-form').addEventListener('submit', uploadLibraryMaterial);
}
async function uploadLibraryMaterial(event) {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form), file = values.get('file');
  const button = form.querySelector('[type="submit"]');
  if (!(file instanceof File) || !file.size) return toast('اختر ملفًا صالحًا للرفع', true);
  if (file.size > 20 * 1024 * 1024) return toast('حجم الملف يجب ألا يتجاوز 20 ميجابايت', true);
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const contentType = file.type || ({ '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' })[extension];
  if (!contentType) return toast('يسمح بملفات PDF وJPG وPNG فقط', true);
  setBusy(button, true, 'جارٍ رفع الملف...');
  let upload;
  try {
    const metadata = {
      subject_id: Number(values.get('subject_id')), title: values.get('title'),
      description: values.get('description'), file_name: file.name,
      content_type: contentType, file_size: file.size
    };
    upload = await api('/academic/library/upload-url', { method: 'POST', body: JSON.stringify(metadata) });
    const uploadForm = new FormData();
    for (const [name, value] of Object.entries(upload.fields)) uploadForm.append(name, value);
    uploadForm.append('file', file, file.name);
    const response = await fetch(upload.url, { method: 'POST', body: uploadForm });
    if (!response.ok) throw new Error(`تعذر رفع الملف إلى المخزن (HTTP ${response.status})`);
    await api('/academic/library/complete', {
      method: 'POST', body: JSON.stringify({ ...metadata, upload_id: upload.upload_id })
    });
    toast('تم رفع الملف وإضافته إلى مكتبة طلاب الفرقة');
    form.reset();
    await renderLibrary();
  } catch (error) {
    if (upload) {
      try {
        await api('/academic/library/cancel-upload', {
          method: 'POST', body: JSON.stringify({ upload_id: upload.upload_id, subject_id: upload.subject_id })
        });
      } catch (cleanupError) {
        console.error('Failed to clean up an incomplete course-material upload:', cleanupError);
        toast('فشل الرفع وتعذر تنظيف الملف المؤقت؛ يرجى إبلاغ الإدارة.', true);
      }
    }
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}
async function deleteLibraryMaterial(id, button) {
  if (!confirm('هل تريد حذف هذا الملف من مكتبة الفرقة؟')) return;
  setBusy(button, true, 'جارٍ الحذف...');
  try {
    await api(`/academic/library/${id}`, { method: 'DELETE' });
    toast('تم حذف الملف من المكتبة');
    await renderLibrary();
  } catch (error) {
    toast(error.message, true);
    setBusy(button, false);
  }
}
async function shareLibraryMaterial(id, button) {
  setBusy(button, true, 'جارٍ إنشاء الرابط...');
  try {
    const result = await api(`/library/share/${encodeURIComponent(id)}`);
    await copySharePath(result.path);
  } catch (error) {
    toast(error.message, true);
  } finally {
    setBusy(button, false);
  }
}
async function createAcademicSubject(event){
  event.preventDefault();const form=new FormData(event.currentTarget),button=event.currentTarget.querySelector('button');setBusy(button,true);
  try{await api('/academic/subjects',{method:'POST',body:JSON.stringify({name:form.get('name'),level_id:Number(form.get('level_id'))})});toast('تمت إضافة المادة');await renderAcademic();}
  catch(error){toast(error.message,true);setBusy(button,false);}
}
async function createAcademicLecture(event){
  event.preventDefault();const form=new FormData(event.currentTarget),button=event.currentTarget.querySelector('button');setBusy(button,true);
  try{await api('/academic/lectures',{method:'POST',body:JSON.stringify({subject_id:Number(form.get('subject_id')),group_id:Number(form.get('group_id')),title:form.get('title'),topic:form.get('topic'),date:form.get('date'),start_time:form.get('start_time'),end_time:form.get('end_time')})});toast('تم إنشاء المحاضرة وإشعار طلاب مجموعتها');await renderAcademic();}
  catch(error){toast(error.message,true);setBusy(button,false);}
}
async function openAcademicLectureEditor(id){
  try{
    const [result,meta]=await Promise.all([api('/academic/lectures?page=1&size=100'),api('/meta')]);
    const lecture=result.items.find(item=>item.id===Number(id));if(!lecture)throw new Error('المحاضرة غير موجودة');
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>تعديل المحاضرة</h2>${iconButton('إغلاق')}</div><form id="lecture-edit-form" data-id="${lecture.id}" class="form-grid"><div class="field"><label>المجموعة</label><select name="group_id">${meta.groups.filter(group=>group.level_id===lecture.level_id).map(group=>`<option value="${group.id}" ${group.id===lecture.group_id?'selected':''}>${esc(group.name)}</option>`).join('')}</select></div><div class="field"><label>التاريخ</label><input name="date" type="date" value="${esc(lecture.lecture_date)}" required></div><div class="field"><label>وقت البداية</label><input name="start_time" type="time" value="${esc(lecture.start_time||'')}" required></div><div class="field"><label>وقت النهاية</label><input name="end_time" type="time" value="${esc(lecture.end_time||'')}" required></div><div class="field"><label>الحالة</label><select name="status"><option value="scheduled" ${lecture.status==='scheduled'?'selected':''}>مجدولة</option><option value="started" ${lecture.status==='started'?'selected':''}>بدأت</option><option value="completed" ${lecture.status==='completed'?'selected':''}>انتهت</option><option value="cancelled" ${lecture.status==='cancelled'?'selected':''}>ملغاة</option></select></div><div class="field wide"><label>عنوان المحاضرة</label><input name="title" value="${esc(lecture.title)}" required minlength="2"></div><div class="field wide"><label>الموضوع</label><textarea name="topic">${esc(lecture.topic)}</textarea></div><div class="form-actions wide"><button class="button">حفظ المحاضرة</button></div></form></section></div>`);
    const form = document.querySelector('#lecture-edit-form');
    setupDateTimePickers(form);
    form.addEventListener('submit',saveAcademicLectureEdit);
  }catch(error){toast(error.message,true);}
}
async function saveAcademicLectureEdit(event){
  event.preventDefault();const form=event.currentTarget,values=new FormData(form),button=form.querySelector('button');setBusy(button,true);
  try{await api(`/academic/lectures/${form.dataset.id}`,{method:'PATCH',body:JSON.stringify({group_id:Number(values.get('group_id')),date:values.get('date'),start_time:values.get('start_time'),end_time:values.get('end_time'),title:values.get('title'),topic:values.get('topic'),status:values.get('status')})});closeModal();toast('تم تحديث المحاضرة وإشعار مجموعتها');await renderAcademic();}
  catch(error){toast(error.message,true);setBusy(button,false);}
}
function createAcademicExam(lectureId){
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>إنشاء اختبار</h2>${iconButton('إغلاق')}</div><form id="exam-create-form" data-lecture="${lectureId}" class="form-grid"><div class="field wide"><label>اسم الاختبار</label><input name="title" required minlength="2"></div><div class="field wide"><label>الوصف (اختياري)</label><textarea name="description" maxlength="4000"></textarea></div><div class="field"><label>المدة بالدقائق</label><input type="number" name="duration_minutes" min="1" max="600" value="20" required></div><div class="field"><label>عدد الأسئلة المعروضة</label><input type="number" name="question_count" min="1" max="500" value="10" required></div><div class="form-actions wide"><button type="button" class="button secondary" data-action="close-modal">إلغاء</button><button class="button">إنشاء مسودة</button></div></form></section></div>`);
  document.querySelector('#exam-create-form').addEventListener('submit',saveAcademicExam);
}
async function saveAcademicExam(event){
  event.preventDefault();const form=event.currentTarget,values=new FormData(form),button=form.querySelector('button[type="submit"]');setBusy(button,true);
  try{const exam=await api(`/academic/lectures/${form.dataset.lecture}/exams`,{method:'POST',body:JSON.stringify({title:values.get('title'),description:values.get('description'),duration_minutes:Number(values.get('duration_minutes')),question_count:Number(values.get('question_count')),status:'draft'})});closeModal();await openExamEditor(exam.id);}
  catch(error){toast(error.message,true);setBusy(button,false);}
}
async function openExamEditor(examId){
  if(document.querySelector('#exam-settings-form'))closeModal();
  try{
    const [exam,questions]=await Promise.all([api('/academic/exams?page=1&size=100'),api(`/academic/exams/${examId}/questions`)]);
    const record=exam.items.find(item=>item.id===Number(examId));if(!record)throw new Error('الاختبار غير موجود');
    const questionRows=questions.items.map(question=>`<li><span>${esc(question.question_text)} <small>(${question.question_type==='multiple_choice'?'اختيار من متعدد':'صح أو خطأ'})</small></span><span><button type="button" class="button secondary" data-question-edit="${question.id}">تعديل</button> <button type="button" class="button danger" data-question-delete="${question.id}">حذف</button></span></li>`).join('');
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>إدارة الاختبار: ${esc(record.title)}</h2>${iconButton('إغلاق')}</div><p>${esc(record.subject_name)} · ${esc(record.lecture_title)} · مخزون الأسئلة ${questions.items.length}/${record.question_count}</p><form id="exam-settings-form" data-id="${examId}" class="form-grid"><div class="field"><label>المدة بالدقائق</label><input name="duration_minutes" type="number" min="1" max="600" value="${record.duration_minutes}" required></div><div class="field"><label>عدد أسئلة الطالب</label><input name="question_count" type="number" min="1" max="500" value="${record.question_count}" required></div><div class="field"><label>حالة الاختبار</label><select name="status"><option value="draft" ${record.status==='draft'?'selected':''}>مسودة</option><option value="published" ${record.status==='published'?'selected':''}>منشور</option><option value="closed" ${record.status==='closed'?'selected':''}>مغلق</option></select></div><div class="form-actions wide"><button class="button">حفظ الإعدادات</button></div></form><h3 class="section-title">مخزون الأسئلة (${questions.items.length})</h3><ul class="exam-question-list">${questionRows||'<li class="muted">لم تتم إضافة أسئلة بعد.</li>'}</ul>${record.status==='draft'?`<form id="question-create-form" class="form-grid"><div class="field wide"><label>السؤال</label><textarea name="question_text" required maxlength="4000"></textarea></div><div class="field"><label>النوع</label><select name="question_type"><option value="multiple_choice">اختيار من متعدد</option><option value="true_false">صح أو خطأ</option></select></div><div class="field wide" data-question-options><label>الاختيارات</label><input name="option_0" placeholder="الخيار الأول" required><input name="option_1" placeholder="الخيار الثاني" required><input name="option_2" placeholder="الخيار الثالث"><input name="option_3" placeholder="الخيار الرابع"></div><div class="field" data-correct-index><label>رقم الاختيار الصحيح</label><select name="correct_answer"><option value="0">الأول</option><option value="1">الثاني</option><option value="2">الثالث</option><option value="3">الرابع</option></select></div><div class="field hidden" data-correct-bool><label>الإجابة الصحيحة</label><select name="true_false_answer"><option value="true">صح</option><option value="false">خطأ</option></select></div><div class="form-actions wide"><button class="button">إضافة سؤال للمخزون</button></div></form>`:''}<div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">إغلاق</button></div></section></div>`);
    const settingsForm=document.querySelector('#exam-settings-form');settingsForm.addEventListener('submit',saveAcademicExamSettings);
    const questionForm=document.querySelector('#question-create-form');if(questionForm){questionForm.addEventListener('submit',addAcademicQuestion);questionForm.elements.question_type.addEventListener('change',()=>toggleQuestionFields(questionForm));}
    document.querySelectorAll('[data-question-edit]').forEach(button=>button.addEventListener('click',()=>editAcademicQuestion(Number(button.dataset.questionEdit),questions.items)));
    document.querySelectorAll('[data-question-delete]').forEach(button=>button.addEventListener('click',()=>deleteAcademicQuestion(Number(button.dataset.questionDelete),examId)));
  }catch(error){toast(error.message,true);}
}
function toggleQuestionFields(form){
  const trueFalse=form.elements.question_type.value==='true_false';
  form.querySelector('[data-question-options]').classList.toggle('hidden',trueFalse);
  form.querySelector('[data-correct-index]').classList.toggle('hidden',trueFalse);
  form.querySelector('[data-correct-bool]').classList.toggle('hidden',!trueFalse);
  for(const input of form.querySelectorAll('[name^="option_"]'))input.required=!trueFalse&&Number(input.name.slice(7))<2;
}
async function addAcademicQuestion(event){
  event.preventDefault();const form=event.currentTarget,values=new FormData(form),type=values.get('question_type'),button=form.querySelector('button');setBusy(button,true);
  const options=type==='multiple_choice'?[0,1,2,3].map(index=>values.get(`option_${index}`)).filter(Boolean):undefined;
  const body={question_text:values.get('question_text'),question_type:type,options,correct_answer:type==='multiple_choice'?Number(values.get('correct_answer')):values.get('true_false_answer')};
  try{await api(`/academic/exams/${form.closest('.modal').querySelector('#exam-settings-form').dataset.id}/questions`,{method:'POST',body:JSON.stringify(body)});toast('تمت إضافة السؤال');await openExamEditor(form.closest('.modal').querySelector('#exam-settings-form').dataset.id);}
  catch(error){toast(error.message,true);setBusy(button,false);}
}
async function saveAcademicExamSettings(event){
  event.preventDefault();const form=event.currentTarget,values=new FormData(form),button=form.querySelector('button');setBusy(button,true);
  try{await api(`/academic/exams/${form.dataset.id}`,{method:'PATCH',body:JSON.stringify({duration_minutes:Number(values.get('duration_minutes')),question_count:Number(values.get('question_count')),status:values.get('status')})});toast('تم حفظ إعدادات الاختبار');closeModal();await renderAcademic();}
  catch(error){toast(error.message,true);setBusy(button,false);}
}
async function editAcademicQuestion(id,questions){
  const question=questions.find(item=>item.id===id);if(!question)return;
  const promptText=prompt('نص السؤال:',question.question_text);if(promptText===null)return;
  const body={question_text:promptText};
  if(question.question_type==='multiple_choice'){
    const options=[];
    for(const [index,option] of question.options.entries()){const value=prompt(`نص الخيار ${index+1}:`,option.text);if(value===null)return;options.push(value);}
    body.options=options;body.correct_answer=question.options.findIndex(option=>option.id===question.correct_answer);
  }else{
    const correct=prompt('الإجابة الصحيحة: اكتب صح أو خطأ',question.correct_answer==='true'?'صح':'خطأ');if(correct===null)return;
    if(!['صح','خطأ'].includes(correct.trim()))return toast('اكتب صح أو خطأ فقط',true);
    body.correct_answer=correct.trim()==='صح'?'true':'false';
  }
  try{await api(`/academic/questions/${id}`,{method:'PATCH',body:JSON.stringify(body)});toast('تم تعديل السؤال');const examId=document.querySelector('#exam-settings-form').dataset.id;await openExamEditor(examId);}
  catch(error){toast(error.message,true);}
}
async function deleteAcademicQuestion(id,examId){
  if(!confirm('حذف هذا السؤال من مخزون الاختبار؟'))return;
  try{await api(`/academic/questions/${id}`,{method:'DELETE',body:'{}'});toast('تم حذف السؤال');await openExamEditor(examId);}
  catch(error){toast(error.message,true);}
}
  function optionLabel(question, optionId) {
    if (question.type === 'true_false') return optionId === 'true' ? 'صح' : 'خطأ';
    return question.options.find(option => option.id === optionId)?.text || '—';
  }
  async function startExam(examId) {
    try { const result = await api(`/student/exams/${examId}/attempts`, { method: 'POST', body: '{}' }); state.examAttemptId = result.id; state.route = 'exam-attempt'; await render(); }
    catch (error) { toast(error.message, true); await renderStudent(); }
  }
  async function startSharedExam(reference, legacyToken = false) {
      const endpoint = legacyToken
        ? `/student/exams/share/${encodeURIComponent(reference)}/start`
        : `/student/exams/link/${encodeURIComponent(reference)}/start`;
      try { const result = await api(endpoint, { method: 'POST', body: '{}' }); state.examAttemptId = result.id; history.replaceState(null, '', '/'); state.route = 'exam-attempt'; await render(); }
    catch (error) { toast(error.message, true); await renderStudent(); }
  }
  async function resumeExam(attemptId) { state.examAttemptId = Number(attemptId); state.route = 'exam-attempt'; await render(); }
  async function renderExamAttempt() {
    if (!state.examAttemptId) { state.route = 'dashboard'; return renderStudent(); }
    const attempt = await api(`/student/attempts/${state.examAttemptId}`);
    if (attempt.status !== 'in_progress') { state.route = 'exam-review'; return renderExamReview(); }
    state.examAttempt = attempt; state.examDepartureCount = attempt.leave_count || 0;
    state.examAnswers = Object.fromEntries(attempt.questions.filter(question => question.selected_answer).map(question => [question.id, question.selected_answer]));
    const questions = attempt.questions.map((question, index) => `<article class="panel exam-question"><div class="panel-head"><h2>السؤال ${fmtCount(index + 1)} من ${fmtCount(attempt.total_questions)}</h2></div><p>${esc(question.text)}</p><fieldset>${question.options.map(option => `<label class="exam-option"><input type="radio" name="question-${question.id}" data-exam-question="${question.id}" value="${esc(option.id)}" ${state.examAnswers[question.id] === option.id ? 'checked' : ''}><span>${esc(option.text)}</span></label>`).join('')}</fieldset></article>`).join('');
    frame(`<section class="exam-topline"><div><h2>${esc(attempt.exam_title)}</h2><p>${esc(attempt.subject_name)} · ${esc(attempt.lecture_title)}</p></div><div class="exam-timer" id="exam-countdown" role="timer"></div></section><form id="exam-answer-form">${questions}<div class="form-actions"><button type="button" class="button" data-action="submit-exam">تسليم الاختبار</button></div></form>`, 'الاختبار', 'يتم حفظ الإجابات تلقائيًا');
    startExamCountdown(attempt.remaining_seconds);
    registerExamIntegrity();
  }
  function startExamCountdown(remainingSeconds) {
    clearInterval(state.examTimer);
    const display = document.querySelector('#exam-countdown'); if (!display) return;
    const deadline = performance.now() + Math.max(0, Number(remainingSeconds) || 0) * 1000;
    let submitting = false;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      display.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
      if (remaining === 0 && !submitting) { submitting = true; submitExam(true); }
    };
    update(); state.examTimer = setInterval(update, 1000);
  }
  function queueExamAnswer(questionId, selectedAnswer) {
    state.examAnswers[questionId] = selectedAnswer; state.examPendingAnswers[questionId] = selectedAnswer;
    clearTimeout(state.examSaveTimer); state.examSaveTimer = setTimeout(flushExamAnswers, 650);
  }
  async function flushExamAnswers() {
    clearTimeout(state.examSaveTimer); state.examSaveTimer = null;
    const pending = Object.entries(state.examPendingAnswers).map(([question_id, selected_answer]) => ({ question_id: Number(question_id), selected_answer }));
    if (!pending.length || !state.examAttemptId) return true;
    try {
      await api(`/student/attempts/${state.examAttemptId}/answers`, { method: 'PUT', body: JSON.stringify({ answers: pending }) });
      for (const answer of pending) if (state.examPendingAnswers[answer.question_id] === answer.selected_answer) delete state.examPendingAnswers[answer.question_id];
      return true;
    } catch (error) { toast(error.message, true); return false; }
  }
  async function submitExam(auto = false) {
    if (!state.examAttemptId) return;
    if (!auto) return confirmExamSubmission();
    if (!(await flushExamAnswers())) return;
    await flushExamIntegrity(); clearInterval(state.examTimer);
    try { await api(`/student/attempts/${state.examAttemptId}/submit`, { method: 'POST', body: '{}' }); state.route = 'exam-review'; await render(); }
    catch (error) { toast(error.message, true); await renderExamAttempt(); }
  }
  function confirmExamSubmission() {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true" aria-labelledby="exam-submit-title"><div class="modal-head"><h2 id="exam-submit-title">تأكيد تسليم الاختبار</h2>${iconButton('إغلاق')}</div><p>هل أنت متأكد من تسليم الاختبار؟ بعد التسليم لن تستطيع تعديل إجاباتك أو إعادة الاختبار.</p><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">متابعة الحل</button><button type="button" class="button" data-action="confirm-submit-exam">تسليم الاختبار</button></div></section></div>`);
  }
  function queueExamIntegrity(eventType) {
    if (!state.examAttemptId || state.examAttempt?.status !== 'in_progress') return;
    const now = Date.now(), hidden = ['TAB_HIDDEN','PAGE_BLUR','PAGE_HIDE'].includes(eventType);
    if (state.examPageHidden === undefined) state.examPageHidden = document.visibilityState === 'hidden';
    if (hidden === state.examPageHidden) return;
    state.examPageHidden = hidden;
    state.examIntegrityEvents.push({ event_type: eventType, question_id: state.examCurrentQuestionId || null, occurred_at: new Date(now).toISOString() });
    if (hidden) {
      state.examDepartureCount = (state.examDepartureCount || 0) + 1;
      if (state.examDepartureCount === 1) toast('تم رصد مغادرة صفحة الاختبار. يرجى البقاء داخل الصفحة حتى الانتهاء.', true);
      else if (state.examDepartureCount === 2) toast('تم رصد مغادرة صفحة الاختبار مرة أخرى.', true);
    }
    clearTimeout(state.examIntegrityTimer); state.examIntegrityTimer = setTimeout(flushExamIntegrity, 1200);
  }
  function registerExamIntegrity() {
    if (state.examIntegrityRegistered) return;
    state.examIntegrityRegistered = true;
    document.addEventListener('visibilitychange', () => queueExamIntegrity(document.visibilityState === 'hidden' ? 'TAB_HIDDEN' : 'TAB_VISIBLE'));
    window.addEventListener('blur', () => queueExamIntegrity('PAGE_BLUR'));
    window.addEventListener('focus', () => queueExamIntegrity('PAGE_FOCUS'));
    window.addEventListener('pagehide', () => {
      queueExamIntegrity('PAGE_HIDE');
      void flushExamIntegrity({ keepalive: true });
    });
    window.addEventListener('pageshow', () => queueExamIntegrity('PAGE_SHOW'));
  }
  async function flushExamIntegrity({ keepalive = false } = {}) {
    clearTimeout(state.examIntegrityTimer); state.examIntegrityTimer = null;
    const events = state.examIntegrityEvents.splice(0, 20); if (!events.length || !state.examAttemptId) return;
    try { await api(`/student/attempts/${state.examAttemptId}/integrity-events`, { method: 'POST', body: JSON.stringify({ events }), keepalive }); }
    catch { state.examIntegrityEvents.unshift(...events); }
  }
  async function renderExamReview() {
    if (!state.examAttemptId) { state.route = 'dashboard'; return renderStudent(); }
    const review = await api(`/student/attempts/${state.examAttemptId}/review`), attempt = review.attempt;
    const rows = review.questions.map((question, index) => `<article class="panel exam-review-question"><h2>السؤال ${fmtCount(index + 1)}: ${esc(question.question_text)}</h2><p>إجابتك: ${esc(optionLabel(question, question.selected_answer))}</p><p>الإجابة الصحيحة: ${esc(optionLabel(question, question.correct_answer))}</p><span class="tag ${question.is_correct ? '' : 'off'}">${question.is_correct ? 'صحيح' : 'خطأ'}</span></article>`).join('');
    frame(`<section class="panel exam-result"><h2>${iconSvg('target')} ${esc(attempt.exam_title)}</h2><div class="summary-grid"><div class="summary-item"><span>الدرجة</span><b>${fmtCount(attempt.score)} / ${fmtCount(attempt.total_questions)}</b></div><div class="summary-item"><span>النسبة</span><b>${fmtCount(Math.round(attempt.percentage))}%</b></div><div class="summary-item"><span>صح</span><b>${fmtCount(attempt.correct_answers)}</b></div><div class="summary-item"><span>خطأ</span><b>${fmtCount(attempt.wrong_answers)}</b></div><div class="summary-item"><span>مدة الحل</span><b>${fmtCount(Math.floor(attempt.duration_seconds / 60))}:${String(attempt.duration_seconds % 60).padStart(2, '0')}</b></div></div></section><section class="exam-review-list">${rows}</section><button class="button secondary" data-route="dashboard">العودة إلى ملفي</button>`, 'نتيجة الاختبار', `${esc(attempt.subject_name)} · ${esc(attempt.lecture_title)}`);
  }
  async function renderStudent() {
    const [s, inbox, meta, examData, lectureData, certificateData] = await Promise.all([api('/student/me'), api('/notifications'), api('/meta'), api('/student/exams'), api('/student/lectures?page=1&size=20'), api('/student/certificates')]); state.data = s;
  state.notifications = inbox.items; state.unreadNotifications = inbox.unread_count;
  const rowsAttendance = s.attendance.map(a => `<tr><td>${dateLabel(a.date)}</td><td>${esc(a.status)}</td><td>${a.created_at ? datetimeLabel(a.created_at) : '—'}</td></tr>`).join('');
  const rowsPayments = s.payments.filter(p => !p.voided_at).map(p => `<tr><td>${datetimeLabel(p.created_at)}</td><td>${moneyLabel(p.amount)}</td><td>${esc(p.recorded_by_name)}</td></tr>`).join('');
  const inProgressHtml = examData.in_progress.map(exam => `<article class="exam-list-item"><div><strong>${esc(exam.title)}</strong><span>${esc(exam.subject_name)} · ${esc(exam.lecture_title)} · ${fmtCount(exam.duration_minutes)} دقيقة</span></div><button class="button" data-resume-exam="${exam.attempt_id}">استكمال الاختبار</button></article>`).join('');
  const availableHtml = examData.available.map(exam => `<article class="exam-list-item"><div><strong>${esc(exam.title)}</strong><span>${esc(exam.subject_name)} · ${esc(exam.lecture_title)} · ${fmtCount(exam.question_count)} سؤال · ${fmtCount(exam.duration_minutes)} دقيقة</span></div><button class="button" data-start-exam="${exam.id}">ابدأ الاختبار</button></article>`).join('');
  const completedHtml = examData.completed.map(exam => `<article class="exam-list-item"><div><strong>${esc(exam.title)}</strong><span>${esc(exam.subject_name)} · ${fmtCount(exam.score)} / ${fmtCount(exam.total_questions)} · ${fmtCount(Math.round(exam.percentage))}% · ${fmtCount(exam.correct_answers)} صح / ${fmtCount(exam.wrong_answers)} خطأ · ${fmtCount(Math.floor(exam.duration_seconds/60))} دقيقة</span></div><button class="button secondary" data-review-exam="${exam.attempt_id}">مراجعة النتيجة</button></article>`).join('');
  const certificatesHtml = certificateData.items.map(certificate => `<article class="exam-list-item"><div><strong>شهادة إتمام ${esc(certificate.course_name)}</strong><span>${esc(certificate.certificate_number)} · صدرت بتاريخ ${dateLabel(certificate.issued_at.slice(0, 10))} · الدكتور ${esc(certificate.issuer_name)}</span></div><a class="button secondary" href="/api/student/certificates/${certificate.id}/print" target="_blank" rel="noopener">عرض الشهادة وحفظها PDF</a></article>`).join('');
  const examCertificatesHtml = certificateData.exam_items.map(certificate => `<article class="exam-list-item"><div><strong>شهادة اختبار ${esc(certificate.exam_title)}</strong><span>${esc(certificate.certificate_number)} · ${esc(certificate.subject_name)} · الدرجة ${fmtCount(certificate.score)} / ${fmtCount(certificate.total_questions)} · ${fmtCount(Math.round(certificate.percentage))}% · الدكتور ${esc(certificate.issuer_name)}</span></div><a class="button secondary" href="/api/student/exam-certificates/${certificate.id}/print" target="_blank" rel="noopener">عرض الشهادة وحفظها PDF</a></article>`).join('');
  const lecturesHtml = lectureData.items.map(lecture => `<article class="exam-list-item"><div><strong>${esc(lecture.title)}</strong><span>${esc(lecture.subject_name)} · ${esc(lecture.topic)} · ${dateLabel(lecture.lecture_date)} · ${esc(lecture.doctor_name)}</span></div></article>`).join('');
  const sharedPath = sharedResourcePath();
  const shareToken = sharedPath?.type === 'exam' ? '' : new URLSearchParams(location.search).get('exam');
  const sharedExamId = sharedPath?.type === 'exam' ? sharedPath.id : '';
  let sharedExamHtml = '';
  if (shareToken || sharedExamId) {
    const endpoint = sharedExamId
      ? `/student/exams/link/${encodeURIComponent(sharedExamId)}`
      : `/student/exams/share/${encodeURIComponent(shareToken)}`;
    try { const sharedExam=await api(endpoint); sharedExamHtml=`<article class="exam-list-item"><div><strong>اختبار تمت مشاركته معك: ${esc(sharedExam.title)}</strong><span>${esc(sharedExam.subject_name)} · ${esc(sharedExam.lecture_title)} · ${fmtCount(sharedExam.question_count)} سؤال · ${fmtCount(sharedExam.duration_minutes)} دقيقة</span></div><button class="button" data-start-shared-exam="${esc(sharedExamId || shareToken)}" data-shared-exam-legacy="${sharedExamId ? 'false' : 'true'}">ابدأ الاختبار</button></article>`; }
    catch(error){sharedExamHtml=`<div class="notice error">${esc(error.message)}</div>`;}
  }
  const academicSection = `<section class="panel"><div class="panel-head"><div><h2>${iconSvg('notebook')} اختباراتي</h2><p>الاختبارات والمحاضرات المؤهلة لفرقتك ومجموعتك</p></div></div>${sharedExamHtml}${inProgressHtml?`<h3 class="section-title">محاولات مستمرة</h3>${inProgressHtml}`:''}<h3 class="section-title">اختبارات متاحة</h3>${availableHtml||'<div class="empty">لا توجد اختبارات منشورة متاحة.</div>'}<h3 class="section-title">اختبارات تم حلها</h3>${completedHtml||'<div class="empty">لا توجد نتائج سابقة.</div>'}<h3 class="section-title">محاضراتي</h3>${lecturesHtml||'<div class="empty">لا توجد محاضرات مسجلة لفرقتك ومجموعتك.</div>'}</section>`;
  const certificateSection = `<section class="panel"><div class="panel-head"><div><h2>شهاداتي</h2><p>الشهادات التي أرسلها لك الدكتور</p></div></div>${certificatesHtml || '<div class="empty">لا توجد شهادات حتى الآن.</div>'}</section>`;
  const examCertificateSection = `<section class="panel"><div class="panel-head"><div><h2>شهادات الاختبارات</h2><p>شهادات الاختبارات التي أرسلها لك الدكتور، مع درجاتك ونسبتك</p></div></div>${examCertificatesHtml || '<div class="empty">لا توجد شهادات اختبارات حتى الآن.</div>'}</section>`;
  frame(`<section class="panel student-card"><div class="profile-head"><div><h2>${esc(s.name)}</h2><div class="profile-meta"><span class="tag">${esc(s.level_name)}</span><span class="tag">${esc(s.group_name)}</span><span class="tag">الكود: ${esc(s.code)}</span></div><div class="summary-grid"><div class="summary-item"><span>الحضور</span><b>${fmtCount(s.present)} يوم</b></div><div class="summary-item"><span>الغياب</span><b>${fmtCount(s.absent)} يوم</b></div><div class="summary-item"><span>نسبة الحضور</span><b>${fmtCount(s.percentage)}%</b></div><div class="summary-item"><span>سعر الكورس</span><b>${moneyLabel(s.price)}</b></div><div class="summary-item"><span>إجمالي المدفوع</span><b>${moneyLabel(s.paid)}</b></div><div class="summary-item"><span>المتبقي</span><b>${moneyLabel(s.remaining)}</b></div></div></div><div class="qr-block"><img src="/api/students/${s.id}/qr" alt="رمز QR للطالب"><button class="button secondary qr-download" data-action="download-qr">حفظ QR على الهاتف</button></div></div></section>${certificateSection}${examCertificateSection}<section class="grid history-grid"><article class="panel"><h2>سجل الحضور</h2>${rowsAttendance ? `<div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>${rowsAttendance}</tbody></table></div>` : '<div class="empty">لا توجد محاضرات مسجلة.</div>'}</article><article class="panel"><h2>سجل المدفوعات</h2>${rowsPayments ? `<div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>بواسطة</th></tr></thead><tbody>${rowsPayments}</tbody></table></div>` : '<div class="empty">لا توجد مدفوعات مسجلة.</div>'}<div class="notice" style="margin-top:12px">إجمالي الكورس ${moneyLabel(s.price)} · المدفوع ${moneyLabel(s.paid)} · المتبقي ${moneyLabel(s.remaining)}</div></article></section>`, 'ملفي الدراسي', `${esc(s.level_name)} · ${esc(s.group_name)}`);
  const attendanceContent = meta.phase.course_started ? (rowsAttendance ? `<div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>${rowsAttendance}</tbody></table></div>` : '<div class="empty">لا توجد محاضرات مسجلة.</div>') : '<div class="notice">المحاضرات لم تبدأ بعد.</div>';
  const studentProfileRows = [
    ['اسم الطالب', esc(s.name)], ['الكود', esc(s.code)], ['الفرقة', esc(s.level_name)], ['المجموعة', esc(s.group_name)],
    ['حالة الحجز', `<span class="tag ${s.booking_status === 'cancelled' ? 'off' : ''}">${bookingLabel(s.booking_status)}</span>`],
    ['سعر الحجز', moneyLabel(s.course_price_snapshot)], ['إجمالي المدفوع', moneyLabel(s.paid)], ['المتبقي', moneyLabel(s.remaining)],
    ...(meta.phase.course_started ? [['الحضور', `${fmtCount(s.present)} يوم`], ['الغياب', `${fmtCount(s.absent)} يوم`], ['نسبة الحضور', `${fmtCount(s.percentage)}%`]] : [])
  ].map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`).join('');
  frame(`<section class="panel student-card"><div class="student-profile-layout"><div class="student-profile-details"><h2>بيانات الطالب</h2><div class="table-scroll student-profile-table"><table><tbody>${studentProfileRows}</tbody></table></div><button class="button large student-qr-trigger" data-action="show-student-qr">اعرض رمز QR لتسجيل الحضور</button></div><div class="qr-block student-profile-qr"><img src="/api/students/${s.id}/qr" alt="رمز QR للطالب"><button class="button secondary qr-download" data-action="download-qr">حفظ QR على الهاتف</button></div></div></section>${certificateSection}${examCertificateSection}<section class="grid history-grid"><article class="panel"><h2>سجل الحضور</h2>${attendanceContent}</article><article class="panel"><h2>سجل المدفوعات</h2>${rowsPayments ? `<div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>بواسطة</th></tr></thead><tbody>${rowsPayments}</tbody></table></div>` : '<div class="empty">لا توجد مدفوعات مسجلة.</div>'}<div class="notice" style="margin-top:12px">إجمالي الكورس ${moneyLabel(s.course_price_snapshot)} · المدفوع ${moneyLabel(s.paid)} · المتبقي ${moneyLabel(s.remaining)}</div></article></section>`, 'ملفي الدراسي', `${esc(s.level_name)} · ${esc(s.group_name)}`);
  document.querySelector('.history-grid')?.insertAdjacentHTML('beforebegin',academicSection);
}
function showStudentQr() {
  const student = state.data;
  if (!student || state.user?.role !== 'student' || document.querySelector('.student-qr-screen')) return;
  document.body.classList.add('student-qr-open');
  document.body.insertAdjacentHTML('beforeend', `<section class="student-qr-screen" role="dialog" aria-modal="true" aria-label="رمز QR لتسجيل الحضور"><button class="icon-button student-qr-close" data-action="close-student-qr" aria-label="إغلاق رمز QR">${iconSvg('close')}</button><img src="/api/students/${student.id}/qr" alt="رمز QR لتسجيل الحضور"></section>`);
  document.querySelector('.student-qr-close')?.focus();
}
function closeStudentQr() {
  document.querySelector('.student-qr-screen')?.remove();
  document.body.classList.remove('student-qr-open');
}
async function renderNotificationInbox() {
  const inbox = await api('/notifications'); state.notifications = inbox.items; state.unreadNotifications = inbox.unread_count;
  const cards = inbox.items.map(item => `<article class="notification-card ${item.is_read ? '' : 'unread'}" data-notification-id="${item.id}"><div class="notification-heading"><div><h2>${esc(item.title)}</h2><span class="tag">${item.is_read ? 'مقروء' : 'غير مقروء'}</span></div><time>${relativeTime(item.created_at)}</time></div><p>${esc(item.message)}</p><div class="notification-footer"><span>S.T.C - مركز السويس للتدريب</span>${item.read_at ? `<span>تمت القراءة ${relativeTime(item.read_at)}</span>` : `<button class="button secondary" data-read-notification="${item.id}">فتح الإشعار</button>`}</div></article>`).join('');
  frame(`<section class="panel"><div class="panel-head"><div><h2>الإشعارات</h2><p>${fmtCount(inbox.unread_count)} غير مقروء</p></div><button class="button secondary" data-action="read-all-notifications" ${inbox.unread_count ? '' : 'disabled'}>تحديد الكل كمقروء</button></div>${cards ? `<div class="notification-list">${cards}</div>` : '<div class="empty"><strong>لا توجد إشعارات</strong>ستظهر هنا الرسائل الداخلية الخاصة بحسابك.</div>'}</section>`, 'الإشعارات', 'إشعارات حسابك فقط');
}
async function markNotificationRead(id) {
  try { await api(`/notifications/${id}/read`, { method: 'PATCH', body: '{}' }); await renderNotificationInbox(); }
  catch (error) { toast(error.message, true); }
}
async function markAllNotificationsRead() {
  try { await api('/notifications/read-all', { method: 'POST', body: '{}' }); toast('تم تحديد الإشعارات كمقروءة'); await renderNotificationInbox(); }
  catch (error) { toast(error.message, true); }
}
async function showStudent(id, target = '#assistant-result') {
  const [s, meta] = await Promise.all([api(`/students/${id}`), api('/meta')]); state.data = s;
  const sessions = await api(`/sessions?date=${encodeURIComponent(state.today)}&group_id=${s.group_id}`);
  const todaySession = sessions.find(session => !session.cancelled);
  const existingToday = s.attendance.find(item => item.date === state.today && item.attendance_id);
  const qr = `<div class="qr-block"><img src="/api/students/${s.id}/qr" alt="QR الطالب"><button class="button secondary qr-download" data-action="download-qr">تنزيل QR</button></div>`;
  const operator = state.user.role === 'assistant';
  const actions = `<div class="profile-actions">${['admin', 'doctor'].includes(state.user.role) ? `<button class="button secondary" data-send-certificate="${s.id}">إرسال شهادة لهذا الطالب</button>` : ''}${operator && meta.phase.course_started && !existingToday && todaySession && s.active && s.booking_status !== 'cancelled' ? '<button class="button" data-action="check-in">تسجيل الحضور</button>' : ''}${operator && s.active && s.booking_status !== 'cancelled' && s.remaining > 0 ? '<button class="button secondary" data-action="payment">تسجيل دفعة</button>' : ''}${operator ? '<button class="button secondary" data-action="edit-student">تعديل البيانات</button><button class="button secondary" data-action="reset-student-password">إعادة تعيين كلمة المرور</button><button class="button secondary" data-action="rotate-qr">إعادة إنشاء QR</button><button class="button secondary" data-action="another-student">مسح طالب آخر</button>' : ''}</div>`;
  const attendanceRows = s.attendance.map(a => `<tr><td>${dateLabel(a.date)}</td><td>${esc(a.status)}</td><td>${esc(a.recorded_by || '—')}</td>${operator ? `<td>${a.attendance_id ? `<button class="button danger" data-attendance-correct="${a.attendance_id}">تصحيح إلى غياب</button>` : '—'}</td>` : ''}</tr>`).join('');
  const paymentRows = s.payments.map(p => `<tr><td>${datetimeLabel(p.created_at)}</td><td>${moneyLabel(p.amount)}</td><td>${esc(p.recorded_by_name)}</td><td>${p.voided_at ? `<span class="tag off">ملغاة · ${esc(p.void_reason)}</span>` : `<a class="button secondary" href="/api/payments/${p.id}/receipt" download="receipt-${p.id}.pdf">تنزيل الإيصال</a>${operator ? ` <button class="button danger" data-payment-void="${p.id}">إلغاء الدفعة</button>` : ''}`}</td></tr>`).join('');
  const adminColumn = operator ? '<th>إجراء</th>' : '';
  const courseStatus = meta.phase.course_started ? '' : '<div class="notice" style="margin-top:12px">الحجز مفتوح — المحاضرات لم تبدأ بعد</div>';
  const statusMessage = s.booking_status === 'cancelled' ? 'هذا الحجز ملغي.' : existingToday ? 'تم تسجيل حضور هذا الطالب اليوم بالفعل ✓' : !meta.phase.course_started ? 'المحاضرات لم تبدأ بعد.' : !todaySession ? 'لا توجد محاضرة مجدولة لهذه المجموعة اليوم.' : '';
  const studentDetailsRows = [
    ['الكود', esc(s.code)], ['الفرقة', esc(s.level_name)], ['المجموعة', esc(s.group_name)],
    ['حالة الحجز', `<span class="tag ${s.booking_status === 'cancelled' ? 'off' : ''}">${bookingLabel(s.booking_status)}</span>${s.active ? '' : ' <span class="tag off">الحساب معطل</span>'}`],
    ['سعر الحجز', moneyLabel(s.course_price_snapshot)], ['المدفوع', moneyLabel(s.paid)], ['المتبقي', moneyLabel(s.remaining)],
    ...(meta.phase.course_started ? [['الحضور', `${fmtCount(s.present)} يوم`], ['الغياب', `${fmtCount(s.absent)} يوم`], ['نسبة الحضور', `${fmtCount(s.percentage)}%`]] : [])
  ].map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`).join('');
  const html = `<section class="panel student-card"><div class="student-staff-layout"><div class="student-staff-details"><h2>${esc(s.name)}</h2><div class="table-scroll student-details-table"><table><tbody>${studentDetailsRows}</tbody></table></div>${actions}${statusMessage ? `<div class="notice" style="margin-top:12px">${statusMessage}</div>` : ''}${operator ? courseStatus : ''}</div>${state.user.role !== 'student' ? qr : ''}</div></section><section class="grid history-grid"><article class="panel"><h2>سجل الحضور</h2>${meta.phase.course_started ? (attendanceRows ? `<div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>التاريخ</th><th>الحالة</th><th>بواسطة</th>${adminColumn}</tr></thead><tbody>${attendanceRows}</tbody></table></div>` : '<div class="empty">لا توجد محاضرات مسجلة.</div>') : '<div class="notice">المحاضرات لم تبدأ بعد.</div>'}</article><article class="panel"><h2>سجل المدفوعات</h2>${paymentRows ? `<div class="table-scroll" style="margin-top:12px"><table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>بواسطة</th><th>إجراء</th></tr></thead><tbody>${paymentRows}</tbody></table></div>` : '<div class="empty">لا توجد مدفوعات مسجلة.</div>'}</article></section>`;
  const host = document.querySelector(target);
  if (host) {
    host.innerHTML = html;
    if (operator) {
      const actionsHost = host.querySelector('.profile-actions');
      if (s.remaining > 0) {
        const remind = document.createElement('button');
        remind.className = 'button secondary'; remind.dataset.action = 'remind-payment'; remind.textContent = 'إرسال إشعار بالمتبقي';
        const payment = actionsHost.querySelector('[data-action="payment"]');
        if (payment) payment.after(remind); else actionsHost.append(remind);
      }
      if (s.payments.length === 0 && !s.attendance.some(item => item.attendance_id)) {
        const remove = document.createElement('button');
        remove.className = 'button danger'; remove.dataset.deleteStudent = String(s.id); remove.textContent = 'حذف الطالب';
        actionsHost.append(remove);
      }
    }
  }
  else if (['admin', 'doctor'].includes(state.user.role)) frame(html, 'بيانات الطالب', `${esc(s.level_name)} · ${esc(s.group_name)} · ${esc(s.code)}`);
}
async function withStudentLoading(operation) {
  showPageLoading('جاري تحميل بيانات الطالب...');
  try { return await operation(); }
  finally { hidePageLoading(); }
}
async function createSession(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), body = Object.fromEntries(form); delete body.level_id; const button = event.currentTarget.querySelector('button'); setBusy(button, true);
  try { await api('/sessions', { method: 'POST', body: JSON.stringify(body) }); toast('تمت إضافة المحاضرة'); await renderSessions(); } catch (error) { toast(error.message, true); setBusy(button, false); }
}
function editSessionModal(id) {
  const session = state.sessions?.find(item => item.id === Number(id)); if (!session) return;
  Promise.all([api('/meta'), api('/session-options')]).then(([meta, sessionOptions]) => {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>تعديل موعد المحاضرة</h2>${iconButton('إغلاق')}</div><form id="session-edit-form" class="form-grid" data-session="${session.id}"><div class="field"><label>المجموعة</label><select name="group_id" required>${meta.groups.map(group => `<option value="${group.id}" data-level="${group.level_id}" ${group.id === session.group_id ? 'selected' : ''}>${esc(meta.levels.find(level => level.id === group.level_id)?.name)} · ${esc(group.name)}</option>`).join('')}</select></div><div class="field"><label>الدكتور</label><select name="doctor_id" required><option value="">اختر الدكتور</option>${sessionOptions.doctors.map(doctor => `<option value="${doctor.id}" ${doctor.id === session.doctor_id ? 'selected' : ''}>${esc(doctor.name)}</option>`).join('')}</select></div><div class="field"><label>المادة</label><select name="subject_id" required disabled><option value="">اختر الدكتور أولًا</option></select></div><div class="field"><label>التاريخ</label><input name="date" type="date" required value="${esc(session.date)}"></div><div class="field"><label>وقت البداية</label><input name="start_time" type="time" required value="${esc(session.start_time || '')}"></div><div class="field"><label>وقت النهاية</label><input name="end_time" type="time" required value="${esc(session.end_time || '')}"></div><div class="field wide"><label>عنوان المحاضرة</label><input name="title" required value="${esc(session.title)}"></div><div class="form-actions wide"><button class="button">حفظ الموعد</button></div></form></section></div>`);
    const form = document.querySelector('#session-edit-form');
    form.classList.add('session-schedule-form');
    const levelField = document.createElement('div'); levelField.className = 'field';
    const levelLabel = document.createElement('label'); levelLabel.textContent = 'الفرقة';
    const levelSelect = document.createElement('select'); levelSelect.name = 'level_id'; levelSelect.required = true;
    levelSelect.innerHTML = meta.levels.map(level => `<option value="${level.id}">${esc(level.name)}</option>`).join('');
    levelField.append(levelLabel, levelSelect);
    form.elements.group_id.closest('.field').before(levelField);
    levelSelect.value = String(meta.groups.find(group => group.id === session.group_id)?.level_id || '');
    refreshSessionGroups(form, meta, session.group_id);
    const updateSubjects = (subjectId = '') => refreshSessionSubjects(form, sessionOptions, subjectId);
    levelSelect.addEventListener('change', () => {
      refreshSessionGroups(form, meta);
      updateSubjects();
    });
    form.elements.doctor_id.addEventListener('change', () => updateSubjects());
    form.elements.group_id.addEventListener('change', () => updateSubjects());
    updateSubjects(session.subject_id || '');
    setupDateTimePickers(form);
    form.addEventListener('submit', saveSessionEdit);
  }).catch(error => toast(error.message, true));
}
async function saveSessionEdit(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), body = Object.fromEntries(form), id = event.currentTarget.dataset.session, button = event.currentTarget.querySelector('button');
  body.group_id = Number(body.group_id); delete body.level_id; setBusy(button, true);
  try { await api(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); closeModal(); toast('تم تحديث موعد المحاضرة'); await renderSessions(); }
  catch (error) { toast(error.message, true); setBusy(button, false); }
}
async function lookup() {
  const code = document.querySelector('#lookup-code')?.value.trim(); if (!code) return toast('أدخل كود الطالب أولًا', true);
  try {
    await withStudentLoading(async () => {
      const student = await api(`/students/lookup?code=${encodeURIComponent(code)}`);
      await showStudent(student.id);
    });
  } catch (error) { toast(error.message, true); }
}
async function loadQrScanner() {
  if (window.Html5Qrcode) return window.Html5Qrcode;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/vendor/qr-scanner.js'; script.onload = resolve; script.onerror = reject; document.head.append(script);
  });
  return window.Html5Qrcode;
}
async function startScan() {
  try {
    const reader = document.querySelector('#scan-reader'); reader.classList.remove('hidden');
    const Html5Qrcode = await loadQrScanner(); state.scanner = new Html5Qrcode('scan-reader');
    await state.scanner.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: 240, height: 240 } }, async decoded => {
      const scanToken = decoded.startsWith('course:') ? decoded.slice(7) : decoded, now = Date.now();
      if (state.scanLock || (scanToken === state.lastScan && now - state.lastScanAt < 1000)) return;
      state.scanLock = true; state.lastScan = scanToken; state.lastScanAt = now;
      await stopScanner();
      try {
        await handleQrAttendance(scanToken);
      }
      catch (error) { toast(error.message, true); }
      finally { state.scanLock = false; }
    }, () => {});
  } catch (error) { toast(`تعذر فتح الكاميرا: ${error.message}`, true); }
}
async function stopScanner() {
  if (!state.scanner) return;
  const scanner = state.scanner; state.scanner = null;
  try { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } catch { /* scanner may already be stopped */ }
}
async function scanFile(file) {
  if (!file) return;
  const reader = document.querySelector('#scan-reader');
  let scanner;
  try {
    await stopScanner();
    reader?.classList.remove('hidden');
    const Html5Qrcode = await loadQrScanner();
    scanner = new Html5Qrcode('scan-reader');
    const decoded = await scanner.scanFile(file, true), token = decoded.startsWith('course:') ? decoded.slice(7) : decoded;
    await handleQrAttendance(token);
  } catch (error) { toast(`تعذر قراءة صورة QR: ${error.message}`, true); }
  finally {
    try { scanner?.clear(); } catch { /* scanner may already be cleared */ }
    reader?.classList.add('hidden');
  }
}
async function handleQrAttendance(token) {
  await withStudentLoading(async () => {
    const student = await api(`/students/lookup?token=${encodeURIComponent(token)}`);
    try {
      const result = await recordAttendance(student);
      toast(result.message || `تم تسجيل حضور ${student.name} بنجاح ✓`);
    } catch (error) {
      toast(error.message, true);
    }
    await showStudent(student.id);
  });
}
async function recordAttendance(student) {
  const sessions = await api(`/sessions?date=${encodeURIComponent(state.today)}&group_id=${student.group_id}`);
  const session = sessions.find(item => !item.cancelled);
  if (!session) throw new Error('لا توجد محاضرة لهذه المجموعة اليوم');
  return api('/attendance', { method: 'POST', body: JSON.stringify({ student_id: student.id, session_id: session.id }) });
}
async function checkIn() {
  const s = state.data; if (!s) return;
  try {
    const response = await recordAttendance(s); toast(response.message || `تم تسجيل حضور ${s.name} بنجاح ✓`);
    if (state.user.role === 'assistant') { await renderAssistant(); await startScan(); } else await showStudent(s.id);
  } catch (error) { toast(error.message, true); await showStudent(s.id).catch(() => {}); }
}
function paymentModal() {
  const s = state.data; if (!s) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">تسجيل دفعة · ${esc(s.name)}</h2>${iconButton('إغلاق')}</div><div class="notice">سعر الكورس ${moneyLabel(s.price)} · المدفوع ${moneyLabel(s.paid)} · المتبقي ${moneyLabel(s.remaining)}</div><form id="payment-form" style="margin-top:16px"><div class="field"><label for="payment-amount">المبلغ الجديد بالجنيه</label><input id="payment-amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" max="${(s.remaining / 100).toFixed(2)}" required></div><button type="submit" class="button" style="margin-top:14px">تسجيل الدفع</button></form></section></div>`);
  const form = document.querySelector('#payment-form');
  const notify = document.createElement('label');
  notify.className = 'field'; notify.style.cssText = 'display:flex;align-items:center;gap:9px;margin-top:12px';
  notify.innerHTML = '<input type="checkbox" name="notify_remaining"><span>إرسال إشعار للطالب بالمتبقي بعد الدفع</span>';
  form.querySelector('button').before(notify);
  form.addEventListener('submit', submitPayment);
}
async function submitPayment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.submitting === 'true') return;
  const button = form.querySelector('button[type="submit"]');
  const amount = form.elements.amount.value;
  const notifyRemaining = form.elements.notify_remaining.checked;
  const studentId = state.data?.id;
  if (!studentId) return toast('تعذر تحديد الطالب؛ أعد فتح ملفه وحاول مجددًا.', true);

  if (form.dataset.uncertain === 'true' &&
      (form.dataset.paymentAmount !== amount || form.dataset.paymentNotify !== String(notifyRemaining))) {
    return toast('يجب إعادة التحقق من نتيجة المحاولة السابقة بنفس البيانات أولًا.', true);
  }
  form.dataset.requestKey ||= crypto.randomUUID();
  form.dataset.paymentAmount = amount;
  form.dataset.paymentNotify = String(notifyRemaining);
  form.dataset.submitting = 'true';
  setBusy(button, true);
  let result;
  try {
    result = await api('/payments', { method: 'POST', body: JSON.stringify({ student_id: studentId, amount,
      request_key: form.dataset.requestKey, notify_remaining: notifyRemaining }) });
  }
  catch (error) {
    form.dataset.submitting = 'false';
    setBusy(button, false);
    if (error.status && error.status < 500) {
      delete form.dataset.requestKey;
      delete form.dataset.paymentAmount;
      delete form.dataset.paymentNotify;
      delete form.dataset.uncertain;
      form.elements.amount.readOnly = false;
      form.elements.notify_remaining.disabled = false;
    } else {
      form.dataset.uncertain = 'true';
      form.elements.amount.readOnly = true;
      form.elements.notify_remaining.disabled = true;
      button.textContent = 'إعادة التحقق من نفس الدفعة';
      toast('تعذر تأكيد نتيجة العملية. أعد المحاولة بنفس المبلغ للتحقق دون تسجيل دفعة مكررة.', true);
      return;
    }
    toast(error.message, true);
    return;
  }
  form.dataset.submitting = 'false';
  closeModal();
  state.data = result.student;
  toast(result.notification_id ? 'تم تسجيل الدفعة وإرسال إشعار المتبقي' : 'تم تسجيل الدفعة');
  try { await renderDashboard(); await showStudent(studentId); }
  catch (error) {
    state.data = result.student;
    console.error('Payment was recorded, but the student view failed to refresh:', error);
    toast('تم تسجيل الدفعة، لكن تعذر تحديث العرض. لم تُكرر الدفعة؛ أعد تحميل الصفحة.', true);
  }
}
function studentModal(s = {}) {
  api('/meta').then(meta => {
    const canSetPrice = state.user.role === 'admin' || state.user.can_set_price;
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${s.id ? 'تعديل بيانات الطالب' : 'إضافة طالب'}</h2>${iconButton('إغلاق')}</div><form id="student-form" class="form-grid"><input type="hidden" name="id" value="${s.id || ''}"><div class="field"><label>اسم الطالب</label><input name="name" required minlength="2" value="${esc(s.name || '')}"></div><div class="field"><label>كود الطالب</label><input name="code" required value="${esc(s.code || '')}"></div><div class="field"><label>الفرقة</label><select name="level_id" required>${meta.levels.map(l => `<option value="${l.id}" ${Number(s.level_id) === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>المجموعة</label><select name="group_id" required>${meta.groups.map(g => `<option value="${g.id}" data-level="${g.level_id}" ${Number(s.group_id) === g.id ? 'selected' : ''}>${esc(meta.levels.find(l => l.id === g.level_id)?.name)} · ${esc(g.name)}</option>`).join('')}</select></div><div class="field"><label>رقم الهاتف (اختياري)</label><input name="phone" value="${esc(s.phone || '')}"></div><div class="field"><label>سعر الكورس بالجنيه</label><input name="price" inputmode="decimal" min="0" step="0.01" value="${s.id ? (s.price / 100).toFixed(2) : (meta.course.price / 100).toFixed(2)}" ${canSetPrice ? '' : 'readonly'}></div>${s.id ? `<label class="field"><span>حالة الحساب</span><select name="active"><option value="true" ${s.active ? 'selected' : ''}>نشط</option><option value="false" ${!s.active ? 'selected' : ''}>معطل</option></select></label>` : `<div class="field"><label>اسم الدخول</label><input name="username" required minlength="3"></div><div class="field"><label>كلمة المرور (12 حرفًا على الأقل)</label><div class="password-input-wrap"><input name="password" type="password" data-password-input minlength="12" required>${passwordToggleMarkup()}</div></div>`}<div class="form-actions wide"><button class="button">${s.id ? 'حفظ التعديلات' : 'حفظ الطالب وإنشاء QR'}</button></div></form></section></div>`);
    const form = document.querySelector('#student-form'), priceField = form.elements.price.closest('.field');
    const priceLabel = document.createElement('label'), priceOutput = document.createElement('output');
    priceLabel.textContent = s.id ? 'سعر الحجز المحفوظ' : 'سعر الكورس حسب الفرقة';
    priceOutput.className = 'calculated-price';
    priceField.replaceChildren(priceLabel, priceOutput);
    const updateDisplayedPrice = () => {
      const levelPrice = meta.course_prices.find(item => item.level_id === Number(form.elements.level_id.value))?.price || 0;
      priceOutput.textContent = moneyLabel(s.id ? s.course_price_snapshot : levelPrice);
    };
    updateDisplayedPrice();
    if (!s.id) {
      const bookingPayment = document.createElement('div');
      bookingPayment.className = 'wide form-grid';
      bookingPayment.innerHTML = '<div class="field"><label for="initial-payment">المبلغ المدفوع عند الحجز (اختياري)</label><input id="initial-payment" name="initial_payment" inputmode="decimal" min="0" step="0.01" value="0"></div><label class="field" style="display:flex;align-items:center;gap:9px"><input type="checkbox" name="notify_initial_payment"><span>إرسال إشعار للطالب بالمتبقي</span></label>';
      form.querySelector('.form-actions').before(bookingPayment);
    }
    form.elements.level_id.addEventListener('change', () => {
      [...form.elements.group_id.options].forEach(option => { option.hidden = option.dataset.level !== form.elements.level_id.value; });
      if (form.elements.group_id.selectedOptions[0]?.hidden) form.elements.group_id.value = form.querySelector(`option[data-level="${form.elements.level_id.value}"]`)?.value || '';
      updateDisplayedPrice();
    });
    if (s.id) {
      const bookingField = document.createElement('div'); bookingField.className = 'field';
      bookingField.innerHTML = `<label for="booking-cancelled">حالة الحجز</label><select id="booking-cancelled" name="cancelled"><option value="false" ${s.booking_status !== 'cancelled' ? 'selected' : ''}>نشط</option><option value="true" ${s.booking_status === 'cancelled' ? 'selected' : ''}>ملغي</option></select>`;
      form.querySelector('.form-actions').before(bookingField);
    }
    form.addEventListener('submit', saveStudent);
  }).catch(error => toast(error.message, true));
}
async function saveStudent(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget), id = form.get('id'), body = Object.fromEntries(form); delete body.id; const button = event.currentTarget.querySelector('button'); setBusy(button, true);
  try {
    if (id) { body.level_id = Number(body.level_id); body.group_id = Number(body.group_id); body.active = body.active === 'true'; body.cancelled = body.cancelled === 'true'; delete body.price; await api(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); }
    else {
      body.level_id = Number(body.level_id); body.group_id = Number(body.group_id);
      body.notify_initial_payment = form.get('notify_initial_payment') === 'on';
      await api('/students', { method: 'POST', body: JSON.stringify(body) });
    }
    closeModal(); toast(id ? 'تم تحديث بيانات الطالب' : 'تم إنشاء حساب الطالب وQR'); await renderStudents();
  } catch (error) { toast(error.message, true); setBusy(button, false); }
}
function closeModal() { document.querySelector('.modal-backdrop')?.remove(); }
function passwordModal() {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="password-title"><div class="modal-head"><h2 id="password-title">تغيير كلمة المرور</h2>${iconButton('إغلاق')}</div><form id="password-form"><div class="field"><label>كلمة المرور الحالية</label><div class="password-input-wrap"><input name="current_password" type="password" data-password-input autocomplete="current-password" required>${passwordToggleMarkup()}</div></div><div class="field" style="margin-top:12px"><label>كلمة المرور الجديدة (12 حرفًا على الأقل)</label><div class="password-input-wrap"><input name="password" type="password" data-password-input autocomplete="new-password" minlength="12" required>${passwordToggleMarkup()}</div></div><button type="submit" class="button" style="margin-top:16px">تحديث كلمة المرور</button></form></section></div>`);
  document.querySelector('#password-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget), button = event.currentTarget.querySelector('button[type="submit"]'); setBusy(button, true);
    try { await api('/password', { method: 'POST', body: JSON.stringify({ current_password: form.get('current_password'), password: form.get('password') }) }); state.user = null; state.csrf = ''; closeModal(); renderLogin(); toast('تم تغيير كلمة المرور. سجّل الدخول مجددًا.'); }
    catch (error) { toast(error.message, true); setBusy(button, false); }
  });
}
async function downloadQr() {
  const s = state.data; if (!s) return;
  try {
    const image = new Image(), response = await fetch(`/api/students/${s.id}/qr`, { credentials: 'same-origin' }); if (!response.ok) throw new Error('QR unavailable'); const objectUrl = URL.createObjectURL(await response.blob()); image.src = objectUrl;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1000; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 800, 1000); ctx.fillStyle = '#173b35'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
    ctx.font = 'bold 46px Tahoma'; ctx.fillText(s.name, 400, 100); ctx.font = '32px Tahoma'; ctx.fillText(s.level_name, 400, 160); ctx.fillText(s.group_name, 400, 210); ctx.fillText(`ID: ${s.code}`, 400, 260); ctx.drawImage(image, 100, 300, 600, 600);
    const link = document.createElement('a'); link.download = `QR-${s.code}.png`; link.href = canvas.toDataURL('image/png'); document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl);
  } catch { toast('تعذر إنشاء صورة QR', true); }
}
async function rotateQr() {
  if (!confirm('سيصبح QR الحالي غير صالح. هل تريد إنشاء QR بديل؟')) return;
  try { await api(`/students/${state.data.id}/qr/rotate`, { method: 'POST', body: '{}' }); toast('تم إبطال QR السابق'); await showStudent(state.data.id); }
  catch (error) { toast(error.message, true); }
}
async function resetStudentPassword() {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true" aria-labelledby="reset-student-password-title"><div class="modal-head"><h2 id="reset-student-password-title">إعادة تعيين كلمة المرور</h2>${iconButton('إغلاق')}</div><form id="reset-student-password-form"><div class="field"><label for="student-new-password">كلمة المرور الجديدة (12 حرفًا على الأقل)</label><div class="password-input-wrap"><input id="student-new-password" name="password" type="password" data-password-input autocomplete="new-password" minlength="12" required>${passwordToggleMarkup()}</div></div><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">إلغاء</button><button type="submit" class="button">حفظ كلمة المرور</button></div></form></section></div>`);
  document.querySelector('#reset-student-password-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type="submit"]'); setBusy(button, true);
    try {
      await api(`/students/${state.data.id}/password`, { method: 'POST', body: JSON.stringify({ password: form.elements.password.value }) });
      closeModal(); toast('تم تغيير كلمة مرور الطالب وإنهاء جلساته');
    } catch (error) { toast(error.message, true); setBusy(button, false); }
  });
}
async function toggleSession(button) {
  try { await api(`/sessions/${button.dataset.session}`, { method: 'PATCH', body: JSON.stringify({ cancelled: button.dataset.cancelled === '1' }) }); toast('تم تحديث حالة المحاضرة'); await renderSessions(); }
  catch (error) { toast(error.message, true); }
}
async function correctAttendance(id) {
  openReasonModal({ id, type: 'attendance', title: 'تصحيح الحضور إلى غياب', label: 'سبب التصحيح', submit: 'تصحيح إلى غياب' });
}
async function voidPayment(id) {
  openReasonModal({ id, type: 'payment', title: 'إلغاء الدفعة', label: 'سبب الإلغاء', submit: 'تأكيد إلغاء الدفعة' });
}
function openReasonModal({ id, type, title, label, submit }) {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" data-dismiss><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${title}</h2>${iconButton('إغلاق')}</div><form id="reason-form" data-id="${id}" data-type="${type}"><div class="field"><label for="operation-reason">${label} (5 أحرف على الأقل)</label><textarea id="operation-reason" name="reason" minlength="5" maxlength="300" required></textarea></div><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">إلغاء</button><button type="submit" class="button danger">${submit}</button></div></form></section></div>`);
  document.querySelector('#reason-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
    setBusy(button, true);
    try {
      const path = form.dataset.type === 'attendance' ? `/attendance/${form.dataset.id}` : `/payments/${form.dataset.id}/void`;
      await api(path, { method: form.dataset.type === 'attendance' ? 'DELETE' : 'POST', body: JSON.stringify({ reason: form.elements.reason.value }) });
      closeModal(); toast(form.dataset.type === 'attendance' ? 'تم تصحيح سجل الحضور إلى غياب' : 'تم إلغاء الدفعة وتسجيل السبب');
      await showStudent(state.data.id);
    } catch (error) { toast(error.message, true); setBusy(button, false); }
  });
}
async function deleteStudent(id) {
  if (!confirm('سيتم حذف حساب الطالب نهائيًا. لا يمكن الحذف إذا كانت له دفعات أو سجلات حضور. هل تريد المتابعة؟')) return;
  try { await api(`/students/${id}`, { method: 'DELETE' }); state.data = null; toast('تم حذف الطالب'); await render(); }
  catch (error) { toast(error.message, true); }
}
async function userAction(id, body) {
  try { await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); toast('تم تحديث الحساب'); await renderUsers(); }
  catch (error) { toast(error.message, true); }
}
async function resetUserPassword(id) {
  const password = prompt('أدخل كلمة مرور جديدة (12 حرفًا على الأقل):'); if (password === null) return;
  await userAction(id, { password });
}
async function logout() {
  try { await api('/logout', { method: 'POST', body: '{}' }); } catch { /* local session is cleared either way */ }
  state.user = null; state.csrf = ''; state.route = 'dashboard'; renderLogin();
}
document.addEventListener('click', async event => {
  const libraryDelete = event.target.closest('[data-library-delete]');
  if (libraryDelete) return deleteLibraryMaterial(libraryDelete.dataset.libraryDelete, libraryDelete);
  const libraryShare = event.target.closest('[data-library-share]');
  if (libraryShare) return shareLibraryMaterial(libraryShare.dataset.libraryShare, libraryShare);
  const wipeApprove = event.target.closest('[data-system-wipe-approve]');
  if (wipeApprove) return approveSystemWipe(wipeApprove.dataset.systemWipeApprove, wipeApprove);
  const wipeCancel = event.target.closest('[data-system-wipe-cancel]');
  if (wipeCancel) return cancelSystemWipe(wipeCancel.dataset.systemWipeCancel, wipeCancel);
  const certificateButton = event.target.closest('[data-send-certificate]');
  if (certificateButton) return sendStudentCertificate(certificateButton.dataset.sendCertificate, certificateButton);
  const nav = event.target.closest('[data-route]'); if (nav) {
    if (nav.disabled || nav.dataset.loading === 'true') return;
    nav.dataset.loading = 'true';
    showPageLoading(`جارٍ فتح ${nav.textContent.trim()}...`);
    if (nav.closest('.mobile-drawer')) closeMobileDrawer(false);
    if (state.route === 'exam-attempt') { await flushExamAnswers(); await flushExamIntegrity(); clearInterval(state.examTimer); }
    state.route = nav.dataset.route;
    state.filters.page = 1;
    try { return await render(); } finally { delete nav.dataset.loading; hidePageLoading(); }
  }
  const examStart=event.target.closest('[data-start-exam]');if(examStart)return startExam(examStart.dataset.startExam);
  const examResume=event.target.closest('[data-resume-exam]');if(examResume)return resumeExam(examResume.dataset.resumeExam);
  const examReview=event.target.closest('[data-review-exam]');if(examReview){state.examAttemptId=Number(examReview.dataset.reviewExam);state.route='exam-review';return render();}
  const sharedExam=event.target.closest('[data-start-shared-exam]');if(sharedExam)return startSharedExam(sharedExam.dataset.startSharedExam,sharedExam.dataset.sharedExamLegacy==='true');
  const submitExamButton=event.target.closest('[data-action="submit-exam"]');if(submitExamButton)return submitExam(false);
  const confirmSubmitExamButton=event.target.closest('[data-action="confirm-submit-exam"]');if(confirmSubmitExamButton){closeModal();return submitExam(true);}
  const createExamButton=event.target.closest('[data-exam-lecture]');if(createExamButton)return createAcademicExam(createExamButton.dataset.examLecture);
  const lectureEditButton=event.target.closest('[data-lecture-edit]');if(lectureEditButton)return openAcademicLectureEditor(lectureEditButton.dataset.lectureEdit);
  const editExamButton=event.target.closest('[data-exam-edit]');if(editExamButton)return openExamEditor(Number(editExamButton.dataset.examEdit));
  const resultsButton=event.target.closest('[data-exam-results]');if(resultsButton)return showExamResults(Number(resultsButton.dataset.examResults));
  const examCertificateButton=event.target.closest('[data-exam-certificate]');if(examCertificateButton)return sendExamCertificate(examCertificateButton);
  const shareExamButton=event.target.closest('[data-exam-share]');if(shareExamButton){try{const result=await api(`/academic/exams/${shareExamButton.dataset.examShare}/share`);await copySharePath(result.path);}catch(error){toast(error.message,true);}return;}
  const resultsTab=event.target.closest('[data-results-tab]');if(resultsTab)return showExamResults(Number(resultsTab.dataset.exam),examResultFilters(1,resultsTab.dataset.resultsTab));
  const resultsPage=event.target.closest('[data-results-page]');if(resultsPage){const page=Math.max(1,Number(document.querySelector('.pagination span')?.textContent?.split('/')[0]?.trim()||1)+Number(resultsPage.dataset.resultsPage));return showExamResults(Number(resultsPage.dataset.exam),examResultFilters(page));}
  const followUpKind = event.target.closest('[data-follow-up-kind]'); if (followUpKind) { state.followUpKind = followUpKind.dataset.followUpKind; state.route = 'follow-up'; return render(); }
  const followUpPage = event.target.closest('[data-follow-up-page]'); if (followUpPage) { state.followUpFilters.page = Math.max(1, state.followUpFilters.page + Number(followUpPage.dataset.followUpPage)); return renderFollowUp(); }
  const reminderButton = event.target.closest('[data-reminder-student]'); if (reminderButton) return openReminder(reminderButton.dataset.reminderStudent);
  const readButton = event.target.closest('[data-read-notification]'); if (readButton) return markNotificationRead(readButton.dataset.readNotification);
  const notificationCard = event.target.closest('[data-notification-id]'); if (notificationCard && !event.target.closest('button')) return markNotificationRead(notificationCard.dataset.notificationId);
  const studentButton = event.target.closest('[data-student]'); if (studentButton) {
    const id = Number(studentButton.dataset.student);
    const loading = state.user.role === 'assistant'
      ? withStudentLoading(async () => studentModal(await api(`/students/${id}`)))
      : withStudentLoading(() => showStudent(id));
    return loading.catch(error => toast(error.message, true));
  }
  const group = event.target.closest('[data-group]'); if (group) { state.filters.group_id = group.dataset.group; state.filters.q = ''; state.filters.page = 1; state.route = 'students'; return render(); }
  const editStructureButton = event.target.closest('[data-structure-edit]'); if (editStructureButton) return editStructure(editStructureButton.dataset.structureEdit, editStructureButton.dataset.id, editStructureButton.dataset.name);
  const deleteStructureButton = event.target.closest('[data-structure-delete]'); if (deleteStructureButton) return deleteStructure(deleteStructureButton.dataset.structureDelete, deleteStructureButton.dataset.id);
  const attendanceCorrection = event.target.closest('[data-attendance-correct]'); if (attendanceCorrection) return correctAttendance(attendanceCorrection.dataset.attendanceCorrect);
  const paymentVoid = event.target.closest('[data-payment-void]'); if (paymentVoid) return voidPayment(paymentVoid.dataset.paymentVoid);
  const deleteStudentButton = event.target.closest('[data-delete-student]'); if (deleteStudentButton) return deleteStudent(deleteStudentButton.dataset.deleteStudent);
  const page = event.target.closest('[data-page]'); if (page) { state.filters.page = Math.max(1, state.filters.page + Number(page.dataset.page)); return renderStudents(); }
  const session = event.target.closest('[data-session]'); if (session) return toggleSession(session);
  const sessionEdit = event.target.closest('[data-session-edit]'); if (sessionEdit) return editSessionModal(sessionEdit.dataset.sessionEdit);
  const toggle = event.target.closest('[data-user-toggle]'); if (toggle) return userAction(toggle.dataset.userToggle, { active: toggle.dataset.active === '1' });
  const passwordButton = event.target.closest('[data-user-password]'); if (passwordButton) return resetUserPassword(passwordButton.dataset.userPassword);
  const permission = event.target.closest('[data-permission]'); if (permission) return userAction(permission.dataset.permission, { can_set_price: permission.checked });
  const exportButton = event.target.closest('[data-export]'); if (exportButton) return exportReport(exportButton.dataset.export);
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle-password') return togglePassword(event.target.closest('[data-action="toggle-password"]'));
  if (action === 'open-mobile-drawer') return openMobileDrawer(); if (action === 'close-mobile-drawer') return closeMobileDrawer();
  if (action === 'toggle-theme') return toggleTheme();
  if (action === 'print-report') { window.print(); return; }
  if (action === 'logout') { closeMobileDrawer(false); return logout(); } if (action === 'refresh') return render(); if (action === 'scan') return startScan(); if (action === 'lookup') return lookup();
  if (action === 'show-student-qr') return showStudentQr(); if (action === 'close-student-qr') return closeStudentQr();
  if (action === 'payment') return paymentModal(); if (action === 'check-in') return checkIn(); if (action === 'download-qr') return downloadQr(); if (action === 'rotate-qr') return rotateQr();
  if (action === 'remind-payment') return openReminder(state.data.id);
  if (action === 'open-notifications') { state.route = 'notifications'; return render(); }
  if (action === 'read-all-notifications') return markAllNotificationsRead();
  if (action === 'confirm-backup-restore') return restoreDatabaseBackup();
  if (action === 'reset-student-password') return resetStudentPassword();
  if (action === 'another-student') { await renderAssistant(); return startScan(); }
  if (action === 'new-student') return studentModal(); if (action === 'edit-student') return studentModal(state.data); if (action === 'close-modal') return closeModal();
  if (action === 'change-password') return passwordModal();
});
appRoot.addEventListener('change', event => {
  if (!event.target.matches('[data-action="scan-file"]')) return;
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) scanFile(file);
});
document.addEventListener('change',event=>{
  const answer=event.target.closest('[data-exam-question]');
  if(answer?.checked){state.examCurrentQuestionId=Number(answer.dataset.examQuestion);queueExamAnswer(state.examCurrentQuestionId,answer.value);}
});
document.addEventListener('click', event => { if (event.target.matches('.modal-backdrop')) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeStudentQr(); closeMobileDrawer(); } });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstallPrompt = event; setupInstallButton(); });
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; document.querySelector('.install-app-button')?.setAttribute('hidden', ''); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(error => console.error('Service worker registration failed:', error)));
document.querySelector('#welcome-modal').addEventListener('click', event => {
  if (event.target.matches('[data-welcome-backdrop]') || event.target.closest('[data-welcome-close]')) closeWelcome();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeWelcome(); });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  try { if (!localStorage.getItem(themeStorageKey)) syncThemeControls(); } catch { syncThemeControls(); }
});
syncThemeControls();
async function boot() {
  const loadingStartedAt = performance.now();
  try {
    const me = await api('/me'); state.user = me.user; state.csrf = me.csrf; state.today = me.today; await render();
  } catch { renderLogin(); }
  const remaining = Math.max(0, 2000 - (performance.now() - loadingStartedAt));
  if (remaining) await new Promise(resolve => window.setTimeout(resolve, remaining));
  await hideGlobalLoading();
  if (state.user?.id) {
    showWelcomeSplash(state.user.id);
    // Initialize AI Chat after user is authenticated
    import('./ai-chat.js').then(m => m.initializeAiChat()).catch(e => console.error('Failed to load AI Chat:', e));
  }
}
boot();