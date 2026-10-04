const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function reportHtml(data) {
  const table = (headings, rows) => `<table><thead><tr>${headings.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const body = data.sections
    ? `${table(['البند', 'العدد أو القيمة'], [
      ['عدد المحاضرات', data.summary.session_count],
      ['الطلاب المتوقع حضورهم', data.summary.scheduled],
      ['الحضور', data.summary.present],
      ['الغياب', data.summary.absent],
      ['عدد الدفعات', data.summary.payment_count],
      ['إجمالي المدفوع بالجنيه', data.summary.payment_total]
    ])}${data.sections.map(section => `<h2>${escape(section.title)}</h2>${table(section.headings, section.rows)}`).join('')}`
    : table(data.headings, data.rows);
  return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${escape(data.title)}</title>
    <style>body{font:12px Arial,sans-serif;color:#183b38}h1{font-size:24px}h2{font-size:18px;margin-top:28px}table{width:100%;border-collapse:collapse;margin-bottom:18px}th,td{padding:9px;border:1px solid #ccd8d5;text-align:right}th{background:#e4efeb}tr{break-inside:avoid}thead{display:table-header-group}p{color:#526861}</style>
    <h1>${escape(data.title)}</h1><p>S.T.C - مركز السويس للتدريب • ${escape(data.date)}</p><p>${escape(data.note)}</p>
    ${body}</html>`;
}