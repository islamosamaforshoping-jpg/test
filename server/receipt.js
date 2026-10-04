const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export function paymentReceiptHtml(receipt) {
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>إيصال دفع ${escape(receipt.number)}</title>
    <style>
      @page{size:A5;margin:12mm}
      body{font:15px Arial,sans-serif;color:#172554;margin:0}
      main{border:2px solid #4f46e5;border-radius:14px;padding:24px}
      h1{text-align:center;color:#3730a3;margin:0 0 6px}
      .brand{text-align:center;color:#64748b;margin:0 0 24px}
      .number{background:#eef2ff;border-radius:8px;padding:12px;text-align:center;font-weight:bold}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{padding:12px;border-bottom:1px solid #e2e8f0;text-align:right}
      th{width:38%;color:#475569}
      .amount{font-size:22px;color:#047857;font-weight:bold}
      .thanks{text-align:center;color:#64748b;margin-top:24px}
    </style>
    <main>
      <h1>إيصال استلام دفعة</h1>
      <p class="brand">S.T.C - مركز السويس للتدريب</p>
      <p class="number">رقم الإيصال: ${escape(receipt.number)}</p>
      <table><tbody>
        <tr><th>اسم الطالب</th><td>${escape(receipt.student_name)}</td></tr>
        <tr><th>كود الطالب</th><td>${escape(receipt.student_code)}</td></tr>
        <tr><th>الفرقة والمجموعة</th><td>${escape(receipt.level_name)} - ${escape(receipt.group_name)}</td></tr>
        <tr><th>تاريخ الدفع</th><td>${escape(receipt.date)}</td></tr>
        <tr><th>المبلغ المستلم</th><td class="amount">${escape(receipt.amount)} جنيه</td></tr>
        <tr><th>استلمها</th><td>${escape(receipt.recorded_by)}</td></tr>
      </tbody></table>
      <p class="thanks">شكرًا لكم</p>
    </main>
  </html>`;
}
