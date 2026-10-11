import type { ExamConfig, Question } from '../data/types'
import { CATEGORY_META, ORAL_ROLES } from '../data/types'

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function choiceLabel(q: Question, choiceId: string): string {
  return q.choices?.find((c) => c.id === choiceId)?.text ?? choiceId
}

export function buildPrintableHtml(
  config: ExamConfig,
  questions: Question[],
  mode: 'exam' | 'answer_key',
): string {
  const cat = CATEGORY_META[config.category].label
  const role = config.role ? ORAL_ROLES.find((r) => r.id === config.role)?.label : ''
  const subtitle = [cat, role].filter(Boolean).join(' — ')
  const date = new Date(config.createdAt || Date.now()).toLocaleDateString('ar-SA')
  const logoUrl = `${window.location.origin}/logo.png`

  const body = questions
    .map((q, i) => {
      const choices =
        q.choices
          ?.map((c) => {
            const mark =
              mode === 'answer_key' && q.correctAnswer === c.id
                ? ' <strong style="color:#062E28">(✓)</strong>'
                : ''
            return `<li>${escapeHtml(c.text)}${mark}</li>`
          })
          .join('') ?? ''

      const keyBlock =
        mode === 'answer_key' && q.answerKey
          ? `<div style="margin-top:8px;padding:10px;background:#f7f1e4;border:1px solid #C1A576;border-radius:8px;font-size:14px;color:#062E28">
              <strong>سلم الحل:</strong> ${escapeHtml(q.answerKey)}
              ${q.correctAnswer ? `<br/><strong>الإجابة:</strong> ${escapeHtml(choiceLabel(q, String(q.correctAnswer)))}` : ''}
            </div>`
          : ''

      const typeHint =
        q.type === 'scale'
          ? '<p style="color:#8A9A8C;font-size:13px">قيّم من 1 (غير موافق بشدة) إلى 5 (موافق بشدة)</p>'
          : q.type === 'oral'
            ? '<p style="color:#8A9A8C;font-size:13px">سؤال شفهي — للمقابل/المقيّم</p>'
            : ''

      return `
        <div style="margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid rgba(193,165,118,.45)">
          <div style="font-weight:700;margin-bottom:6px;color:#062E28">${i + 1}. ${escapeHtml(q.text)}</div>
          ${typeHint}
          ${choices ? `<ol type="أ" style="margin:8px 0 0 0;padding-right:22px;color:#062E28">${choices}</ol>` : ''}
          ${q.type === 'open' || q.type === 'oral' ? '<div style="margin-top:10px;border-bottom:1px dashed #B99B6A;height:40px"></div><div style="margin-top:10px;border-bottom:1px dashed #B99B6A;height:40px"></div>' : ''}
          ${q.type === 'scale' ? '<p style="color:#062E28">1 ☐ &nbsp; 2 ☐ &nbsp; 3 ☐ &nbsp; 4 ☐ &nbsp; 5 ☐</p>' : ''}
          ${keyBlock}
          ${mode === 'answer_key' && q.rubric?.length ? '<ul>' + q.rubric.map((r) => '<li>' + escapeHtml(r.criterion) + ' (' + r.maxPoints + ' درجة)</li>').join('') + '</ul>' : ''}
        </div>`
    })
    .join('')

  const titleExtra = mode === 'answer_key' ? ' — سلم الحل' : ''

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(config.title)}${titleExtra}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    html, body, button, input, textarea, select, * { font-family: Cairo, ui-sans-serif, system-ui, sans-serif; }
    body { color: #062E28; max-width: 800px; margin: 24px auto; padding: 16px; line-height: 1.7; background:#fff; }
    .header { display:flex; align-items:center; gap:16px; margin-bottom:20px; padding-bottom:16px; border-bottom:2px solid #C1A576; }
    .header img { width:64px; height:64px; object-fit:contain; }
    h1 { margin: 0 0 4px; font-size: 22px; color:#062E28; }
    .brand { color:#B99B6A; font-size:13px; font-weight:700; margin-bottom:2px; }
    .meta { color: #8A9A8C; margin-bottom: 24px; font-size: 14px; }
    .badge { display:inline-block; background:#F5D98A; color:#062E28; padding:4px 10px; border-radius:999px; font-size:12px; margin-left:6px; font-weight:700 }
    button { background:#C1A576;color:#062E28;border:0;padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:700 }
    @media print { body { margin: 0; } .no-print { display:none } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()">طباعة / حفظ PDF</button>
  </div>
  <div class="header">
    <img src="${logoUrl}" alt="شعار" />
    <div>
      <div class="brand">منصة الاختبارات · منظومة التقييم</div>
      <h1>${escapeHtml(config.title)}${titleExtra}</h1>
    </div>
  </div>
  <div class="meta">
    <span class="badge">${escapeHtml(subtitle)}</span>
    <span>التاريخ: ${date}</span> —
    <span>عدد الأسئلة: ${questions.length}</span>
  </div>
  ${mode === 'answer_key' ? '<p style="background:#F5D98A;border:1px solid #C1A576;padding:10px;border-radius:8px;color:#062E28">نسخة سلم الحل للمصحح — لا توزّع على المختبرين.</p>' : ''}
  ${body}
  <script>setTimeout(() => window.print(), 400)</script>
</body>
</html>`
}

export function openPrintWindow(
  config: ExamConfig,
  questions: Question[],
  mode: 'exam' | 'answer_key',
): void {
  const html = buildPrintableHtml(config, questions, mode)
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) {
    alert('يرجى السماح بالنوافذ المنبثقة لتصدير PDF')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
