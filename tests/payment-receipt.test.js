import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createApp } from '../server/app.js';
import { passwordHash } from '../server/db.js';
import { paymentReceiptHtml } from '../server/receipt.js';

async function extractPdfText(buffer) {
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const document = await loadingTask.promise;
  const pages = await Promise.all(Array.from({ length: document.numPages }, async (_, index) => {
    const page = await document.getPage(index + 1);
    const content = await page.getTextContent();
    return content.items.map(item => item.str).join(' ');
  }));
  await loadingTask.destroy();
  return pages.join('\n');
}

function containsArabicWords(text, phrase) {
  const normalized = text.normalize('NFKC').replace(/\s/g, '');
  return phrase.split(/\s+/).every(word => normalized.includes([...word].reverse().join('')));
}

test('payment receipt includes payment details and escapes user-provided text', () => {
  const html = paymentReceiptHtml({
    number: 'STC-2026-000123',
    student_name: '<script>alert(1)</script>',
    student_code: 'S-123',
    level_name: 'الفرقة الأولى',
    group_name: 'المجموعة أ',
    date: '٢ أكتوبر ٢٠٢٦، ٣:٠٠ م',
    amount: '1,250.00',
    recorded_by: 'دنيا'
  });

  assert.match(html, /STC-2026-000123/);
  assert.match(html, /S-123/);
  assert.match(html, /1,250\.00 جنيه/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('payment receipt endpoint downloads a PDF for authenticated staff', async () => {
  const password = 'correct horse battery staple';
  const user = {
    id: 10, name: 'Dunia', username: 'assistant', role: 'assistant',
    active: 1, password_hash: passwordHash(password), can_set_price: 0
  };
  let session = null;
  const payment = {
    id: 123, amount: 12500, created_at: '2026-10-02T12:00:00.000Z',
    voided_at: null, student_code: 'S-123', student_name: 'طالب اختبار',
    level_name: 'الفرقة الأولى', group_name: 'المجموعة أ', recorded_by: 'دنيا'
  };
  const db = {
    pool: {
      async connect() {
        return {
          async query() { return { rows: [] }; },
          release() {}
        };
      }
    },
    async query(sql, params = []) {
      if (sql.includes('FROM users WHERE username=?')) return { rows: [user] };
      if (sql.includes('FROM users WHERE id=?')) return { rows: [user] };
      if (sql.includes('DELETE FROM auth_sessions')) return { rows: [] };
      if (sql.startsWith('INSERT INTO auth_sessions')) {
        session = { token_hash: params[0], csrf: params[2], expires_at: params[3] };
        return { rows: [] };
      }
      if (sql.startsWith('INSERT INTO audit_logs')) return { rows: [] };
      if (sql.includes('FROM auth_sessions a JOIN users u')) {
        return { rows: session && session.token_hash === params[0] && session.expires_at > params[1]
          ? [{ ...user, token_hash: session.token_hash, csrf: session.csrf }]
          : [] };
      }
      if (sql.includes("FROM system_wipe_requests") && sql.includes("status='processing'")) return { rows: [] };
      if (sql.includes('FROM payments p') && sql.includes('WHERE p.id=?')) {
        return { rows: payment.id === params[0] ? [{ ...payment }] : [] };
      }
      if (sql.includes('FROM students s JOIN levels l')) {
        return { rows: [{
          id: 42, name: payment.student_name, code: payment.student_code,
          username: 'student', level_name: payment.level_name, group_name: payment.group_name,
          level_id: 3, group_id: 8, course_price_snapshot: 20000, price: 20000
        }] };
      }
      if (sql.includes('FROM course_settings WHERE id=1')) return { rows: [] };
      if (sql.includes('COALESCE(SUM(amount),0) total FROM payments WHERE student_id=?')) {
        return { rows: [{ total: payment.amount }] };
      }
      if (sql.includes('SELECT amount,created_at FROM payments WHERE student_id=?')) return { rows: [] };
      if (sql.includes('LEFT JOIN attendance')) return { rows: [] };
      if (sql.includes('FROM course_sessions cs')) return { rows: [] };
      if (sql.includes('FROM payments p')) return { rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const app = createApp({ db, secureCookies: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const loginResponse = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user.username, password })
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);

    const unauthenticatedReceipt = await fetch(`${base}/api/payments/${payment.id}/receipt`);
    assert.equal(unauthenticatedReceipt.status, 401);

    const response = await fetch(`${base}/api/payments/${payment.id}/receipt`, {
      headers: { cookie }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/pdf/);
    assert.match(response.headers.get('content-disposition'), /attachment;.*receipt-STC-2026-000123\.pdf/);
    const receiptPdf = Buffer.from(await response.arrayBuffer());
    assert.equal(receiptPdf.subarray(0, 4).toString(), '%PDF');
    const receiptText = await extractPdfText(receiptPdf);
    assert.match(receiptText, /STC-2026-000123/);
    assert.ok(containsArabicWords(receiptText, 'طالب اختبار'));
    assert.match(receiptText, /١٢٥٫٠٠/);
    assert.ok(containsArabicWords(receiptText, 'دنيا'));
    assert.match(receiptText, /٢٠٢٦/);

    const missingReceipt = await fetch(`${base}/api/payments/404/receipt`, { headers: { cookie } });
    assert.equal(missingReceipt.status, 404);
    payment.voided_at = '2026-10-02T12:30:00.000Z';
    const voidedReceipt = await fetch(`${base}/api/payments/${payment.id}/receipt`, { headers: { cookie } });
    assert.equal(voidedReceipt.status, 409);
    payment.voided_at = null;

    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({ acceptDownloads: true });
      await context.addCookies([{
        name: cookie.split('=')[0],
        value: cookie.slice(cookie.indexOf('=') + 1),
        domain: '127.0.0.1',
        path: '/'
      }]);
      const page = await context.newPage();
      await page.setContent(`<a href="${base}/api/payments/${payment.id}/receipt" download>تنزيل الإيصال</a>`);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('link', { name: 'تنزيل الإيصال' }).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'receipt-STC-2026-000123.pdf');
      assert.ok(await download.path());
      await context.close();
    } finally {
      await browser.close();
    }

    const expectedTitles = {
      daily: 'التقرير اليومي للمساعد',
      students: 'كشف الطلاب والمجموعات',
      attendance: 'كشف الحضور',
      payments: 'كشف المدفوعات'
    };
    for (const [type, title] of Object.entries(expectedTitles)) {
      const reportResponse = await fetch(`${base}/api/reports/export?type=${type}&date=2026-10-02&format=pdf`, {
        headers: { cookie }
      });
      assert.equal(reportResponse.status, 200);
      assert.match(reportResponse.headers.get('content-type'), /application\/pdf/);
      assert.match(reportResponse.headers.get('content-disposition'), /attachment;.*course-report\.pdf/);
      const reportPdf = Buffer.from(await reportResponse.arrayBuffer());
      assert.equal(reportPdf.subarray(0, 4).toString(), '%PDF');
      const reportText = await extractPdfText(reportPdf);
      assert.ok(containsArabicWords(reportText, title.split(' ')[0]), `PDF text did not include report title: ${title}`);
      if (type === 'daily') {
        assert.ok(containsArabicWords(reportText, 'إجمالي المدفوع بالجنيه'));
        assert.ok(reportText.includes('0'), 'Daily PDF did not include the zero-valued test totals');
      }
    }

    const workbookResponse = await fetch(`${base}/api/reports/export?type=daily&date=2026-10-02&format=xlsx`, {
      headers: { cookie }
    });
    assert.equal(workbookResponse.status, 200);
    assert.match(workbookResponse.headers.get('content-type'), /spreadsheetml/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await workbookResponse.arrayBuffer()));
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['الملخص', 'الحضور والغياب', 'المدفوعات']);
    assert.equal(workbook.getWorksheet('الملخص').getCell('A1').value, expectedTitles.daily);
    assert.equal(workbook.getWorksheet('الملخص').getCell('B8').value, 0);

    const reportBrowser = await chromium.launch({ headless: true });
    try {
      const context = await reportBrowser.newContext({ acceptDownloads: true });
      await context.addCookies([{
        name: cookie.split('=')[0],
        value: cookie.slice(cookie.indexOf('=') + 1),
        domain: '127.0.0.1',
        path: '/'
      }]);
      const page = await context.newPage();
      await page.setContent(`<button type="button">تنزيل تقرير PDF</button>`);
      await page.locator('button').evaluate((button, url) => {
        button.addEventListener('click', () => {
          const link = document.createElement('a');
          link.href = url;
          link.download = 'course-report.pdf';
          document.body.append(link);
          link.click();
          link.remove();
        });
      }, `${base}/api/reports/export?type=attendance&date=2026-10-02&format=pdf`);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'تنزيل تقرير PDF' }).click();
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'course-report.pdf');
      assert.ok(await download.path());
      await context.close();
    } finally {
      await reportBrowser.close();
    }
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('payment API validates amounts and safely accepts idempotent retries', async () => {
  const assistantPassword = 'assistant test password';
  const doctorPassword = 'doctor test password';
  const users = [
    { id: 10, name: 'Dunia', username: 'assistant', role: 'assistant', active: 1, password_hash: passwordHash(assistantPassword) },
    { id: 11, name: 'Doctor', username: 'doctor', role: 'doctor', active: 1, password_hash: passwordHash(doctorPassword) }
  ];
  const sessions = new Map();
  const payments = [];
  const lockTails = new Map();
  const lockReleases = new Map();
  let nextPaymentId = 1;
  const student = {
    id: 42, name: 'طالب اختبار', code: 'S-123', username: 'student', user_id: 99,
    active: 1, cancelled_at: null, level_name: 'الفرقة الأولى', group_name: 'المجموعة أ',
    level_id: 3, group_id: 8, course_price_snapshot: 20000, price: 20000
  };
  const unlockFirstTransactionLock = () => {
    const acquired = [...lockReleases.values()].find(queue => queue.length)?.shift();
    acquired?.();
  };
  const db = {
    pool: {
      async connect() {
        return {
          async query(statement) {
            if (statement === 'COMMIT' || statement === 'ROLLBACK') unlockFirstTransactionLock();
            return { rows: [] };
          },
          release() {}
        };
      }
    },
    async query(sql, params = []) {
      if (sql.includes('FROM users WHERE username=?')) return { rows: users.filter(user => user.username === params[0]) };
      if (sql.includes('FROM users WHERE id=?')) return { rows: users.filter(user => user.id === params[0]) };
      if (sql.includes('DELETE FROM auth_sessions')) return { rows: [] };
      if (sql.startsWith('INSERT INTO auth_sessions')) {
        sessions.set(params[0], { token_hash: params[0], user_id: params[1], csrf: params[2], expires_at: params[3] });
        return { rows: [] };
      }
      if (sql.includes('FROM auth_sessions a JOIN users u')) {
        const session = sessions.get(params[0]);
        const user = users.find(item => item.id === session?.user_id);
        return { rows: session && user && session.expires_at > params[1]
          ? [{ ...user, token_hash: session.token_hash, csrf: session.csrf }]
          : [] };
      }
      if (sql.includes("FROM system_wipe_requests") && sql.includes("status='processing'")) return { rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) {
        const key = params[0];
        const previous = lockTails.get(key) || Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        lockTails.set(key, previous.then(() => current));
        await previous;
        const queue = lockReleases.get(key) || [];
        queue.push(release);
        lockReleases.set(key, queue);
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM payments WHERE request_key=?')) {
        return { rows: payments.filter(payment => payment.request_key === params[0]) };
      }
      if (sql.includes('SELECT id FROM students WHERE id=? FOR UPDATE')) {
        return { rows: params[0] === student.id ? [{ id: student.id }] : [] };
      }
      if (sql.includes('FROM students s') && sql.includes('level_name')) return { rows: params[0] === student.id ? [{ ...student }] : [] };
      if (sql.includes('COALESCE(SUM(amount),0) total FROM payments WHERE student_id=?')) {
        return { rows: [{ total: payments.filter(payment => payment.student_id === params[0] && !payment.voided_at).reduce((sum, payment) => sum + payment.amount, 0) }] };
      }
      if (sql.startsWith('INSERT INTO payments(')) {
        const [studentId, amount, recordedBy, requestKey] = params;
        const payment = { id: nextPaymentId++, student_id: studentId, amount, recorded_by: recordedBy, request_key: requestKey, voided_at: null };
        payments.push(payment);
        return { rows: [{ id: payment.id }], lastInsertRowid: payment.id };
      }
      if (sql.startsWith('INSERT INTO audit_logs')) return { rows: [] };
      if (sql.includes('FROM course_settings WHERE id=1')) return { rows: [] };
      if (sql.includes('SELECT p.*,u.name recorded_by_name')) {
        return { rows: payments.filter(payment => payment.student_id === params[0]).map(payment => ({ ...payment, recorded_by_name: 'Dunia' })) };
      }
      throw new Error(`Unexpected payment API query: ${sql}`);
    }
  };
  const app = createApp({ db, secureCookies: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = async (user, password) => {
      const response = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: user, password })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      return {
        cookie: response.headers.get('set-cookie')?.split(';')[0],
        csrf: body.csrf
      };
    };
    const assistant = await login('assistant', assistantPassword);
    const doctor = await login('doctor', doctorPassword);
    const request = (credentials, amount, requestKey) => fetch(`${base}/api/payments`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: credentials.cookie,
        'x-csrf-token': credentials.csrf
      },
      body: JSON.stringify({ student_id: student.id, amount, request_key: requestKey })
    });
    const unauthorized = await fetch(`${base}/api/payments`, { method: 'POST' });
    assert.equal(unauthorized.status, 401);
    assert.equal((await request(doctor, '50.00', 'doctor-attempt-00001')).status, 403);

    for (const amount of ['', '-1', '0', 'nope', '1.001']) {
      assert.equal((await request(assistant, amount, `invalid-amount-${String(amount).padEnd(8, '_')}`)).status, 400);
    }
    assert.equal(payments.length, 0);

    const amountTooLarge = await request(assistant, '200.01', 'amount-too-large-0001');
    assert.equal(amountTooLarge.status, 400);
    assert.equal(payments.length, 0);

    const key = 'payment-retry-key-0001';
    const first = await request(assistant, '50.00', key);
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.equal(firstBody.student.paid, 5000);
    assert.equal(firstBody.student.remaining, 15000);
    const retry = await request(assistant, '50.00', key);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).id, firstBody.id);
    assert.equal(payments.length, 1);

    const concurrentKey = 'payment-concurrent-key-01';
    const concurrent = await Promise.all([
      request(assistant, '25.00', concurrentKey),
      request(assistant, '25.00', concurrentKey)
    ]);
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 201]);
    assert.equal(payments.length, 2);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('payment UI blocks double submit and retries ambiguous requests with the same key', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const sourceWithoutBoot = source.replace(/\nboot\(\);\s*$/, '\n');
  assert.notEqual(sourceWithoutBoot, source, 'The test should load the production UI without running app bootstrap');

  const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html lang="ar" dir="rtl"><body>
      <div id="app"></div><div id="toast-root"></div><div id="global-loading-screen" hidden></div>
      <div id="welcome-modal"></div></body></html>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addScriptTag({ content: sourceWithoutBoot });
    await page.evaluate(() => {
      state.user = { role: 'assistant' };
      state.csrf = 'test-csrf';
      state.data = { id: 42, name: 'طالب اختبار', price: 20000, paid: 0, remaining: 20000 };
      renderDashboard = async () => {};
      showStudent = async () => {};
      window.__paymentRequests = [];
      window.fetch = async (_, options) => {
        window.__paymentRequests.push(JSON.parse(options.body));
        await new Promise(resolve => setTimeout(resolve, 80));
        return new Response(JSON.stringify({
          student: { id: 42, name: 'طالب اختبار', price: 20000, paid: 5000, remaining: 15000 }
        }), { status: 201, headers: { 'content-type': 'application/json' } });
      };
      paymentModal();
      const form = document.querySelector('#payment-form');
      form.elements.amount.value = '50.00';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
    const successfulRequests = await page.evaluate(() => ({
      requests: window.__paymentRequests,
      paid: state.data.paid,
      toast: document.querySelector('#toast-root').textContent
    }));
    assert.equal(successfulRequests.requests.length, 1);
    assert.equal(successfulRequests.paid, 5000);
    assert.match(successfulRequests.toast, /تم تسجيل الدفعة/);

    await page.evaluate(async () => {
      state.data = { id: 42, name: 'طالب اختبار', price: 20000, paid: 0, remaining: 20000 };
      window.__paymentRequests = [];
      window.__requestAttempt = 0;
      window.fetch = async (_, options) => {
        window.__paymentRequests.push(JSON.parse(options.body));
        if (window.__requestAttempt++ === 0) throw new TypeError('network disconnected after sending');
        return new Response(JSON.stringify({
          student: { id: 42, name: 'طالب اختبار', price: 20000, paid: 5000, remaining: 15000 }
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      };
      paymentModal();
      const form = document.querySelector('#payment-form');
      form.elements.amount.value = '50.00';
      await submitPayment({ preventDefault() {}, currentTarget: form });
      window.__uncertainPaymentForm = form;
      window.__originalRequestKey = form.dataset.requestKey;
      window.__retryState = {
        uncertain: form.dataset.uncertain,
        amountLocked: form.elements.amount.readOnly,
        retryLabel: form.querySelector('button[type="submit"]').textContent
      };
      await submitPayment({ preventDefault() {}, currentTarget: form });
    });
    await page.waitForFunction(() => !document.querySelector('.modal-backdrop'));
    const retryState = await page.evaluate(() => ({
      requests: window.__paymentRequests,
      uncertain: window.__retryState.uncertain,
      amountLocked: window.__retryState.amountLocked,
      retryLabel: window.__retryState.retryLabel,
      originalKey: window.__originalRequestKey,
      state: state.data
    }));
    assert.equal(retryState.requests.length, 2);
    assert.equal(retryState.requests[0].request_key, retryState.originalKey);
    assert.equal(retryState.requests[1].request_key, retryState.originalKey);
    assert.equal(retryState.requests[0].amount, retryState.requests[1].amount);
    assert.equal(retryState.uncertain, 'true');
    assert.equal(retryState.amountLocked, true);
    assert.match(retryState.retryLabel, /إعادة التحقق/);
    assert.equal(retryState.state.paid, 5000);
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
