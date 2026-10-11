import type { Question } from '../data/types'

const SCALE_LABELS = ['1 غير موافق بشدة', '2', '3 محايد', '4', '5 موافق بشدة']

interface Props {
  question: Question
  index: number
  value?: string | number | string[]
  onChange?: (value: string | number | string[]) => void
  showAnswer?: boolean
  readOnly?: boolean
  /** إخفاء الموضوع/الدرجات عن الممتحن لتقليل التلميحات */
  hideMeta?: boolean
}

export function QuestionCard({
  question,
  index,
  value,
  onChange,
  showAnswer,
  readOnly,
  hideMeta,
}: Props) {
  const isMultiChoice = Array.isArray(question.correctAnswer)

  const handleChoiceToggle = (choiceId: string) => {
    if (readOnly) return
    if (isMultiChoice) {
      const currentList = Array.isArray(value) ? [...value] : (typeof value === 'string' && value ? [value] : [])
      const nextList = currentList.includes(choiceId)
        ? currentList.filter((id) => id !== choiceId)
        : [...currentList, choiceId]
      onChange?.(nextList)
    } else {
      onChange?.(choiceId)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-bold leading-relaxed text-text">
          <span className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gold/20 text-sm text-light-gold">
            {index + 1}
          </span>
          {question.text}
        </h3>
        {!hideMeta && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-line bg-panel px-2.5 py-1 font-medium text-mute">
              {question.type === 'classic' ? 'سؤال مقالي' : question.topic}
            </span>
            <span className="rounded-full border border-line bg-ink px-2.5 py-1 font-medium text-warn">
              {question.points} درجة
            </span>
            {isMultiChoice && (
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs text-gold">
                متعدد الإجابات
              </span>
            )}
          </div>
        )}
      </div>

      {(question.type === 'mcq' || question.type === 'true_false') && question.choices && (
        <div className="space-y-2">
          {question.choices.map((c) => {
            const isSelected = isMultiChoice
              ? (Array.isArray(value) ? value.includes(c.id) : value === c.id)
              : value === c.id

            const isCorrect = showAnswer && (
              isMultiChoice
                ? Array.isArray(question.correctAnswer) && question.correctAnswer.includes(c.id)
                : question.correctAnswer === c.id
            )

            return (
              <label
                key={c.id}
                className={`flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                  isCorrect
                    ? 'border-ok/60 bg-ok/10'
                    : isSelected
                      ? 'border-gold bg-gold/10'
                      : 'border-line hover:border-gold/60 hover:bg-panel'
                } ${readOnly ? 'cursor-default' : ''}`}
              >
                <input
                  type={isMultiChoice ? 'checkbox' : 'radio'}
                  name={isMultiChoice ? `${question.id}-${c.id}` : question.id}
                  className="accent-gold h-4 w-4 rounded"
                  checked={isSelected}
                  disabled={readOnly}
                  onChange={() => handleChoiceToggle(c.id)}
                />
                <span className="flex-1 text-sm font-medium leading-6 text-text-2">{c.text}</span>
              </label>
            )
          })}
        </div>
      )}

      {(question.type === 'open' || question.type === 'oral' || question.type === 'classic') && (
        <div className="space-y-3">
          <textarea
            className="mt-1 w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm text-text outline-none placeholder:text-mute focus:border-gold"
            rows={question.type === 'classic' ? 6 : 4}
            placeholder={
              question.type === 'oral' && !hideMeta
                ? 'ملاحظات المقيّم / نقاط الإجابة الشفهية...'
                : question.type === 'classic'
                  ? 'اكتب إجابتك المقالية المفصلة هنا (تخضع للتقييم اليدوي وفق المعايير)...'
                  : 'اكتب إجابتك هنا...'
            }
            value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
            disabled={readOnly}
            onChange={(e) => onChange?.(e.target.value)}
          />
          {question.rubric && question.rubric.length > 0 && (
            <div className="rounded-xl border border-line/60 bg-panel/60 p-3 text-xs">
              <div className="mb-1 font-semibold text-text-2">معايير التقييم (Rubric):</div>
              <ul className="space-y-1 text-mute">
                {question.rubric.map((r, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>• {r.criterion}</span>
                    <span className="text-warn">{r.maxPoints} درجة</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {question.type === 'scale' && (
        <div className="flex flex-wrap gap-2">
          {SCALE_LABELS.map((label, i) => {
            const v = i + 1
            const selected = Number(value) === v
            return (
              <button
                key={v}
                type="button"
                disabled={readOnly}
                onClick={() => onChange?.(v)}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  selected
                    ? 'border-gold bg-gold text-ink'
                    : 'border-line bg-panel text-text-2 hover:border-gold/60'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {showAnswer && question.answerKey && (
        <div className="mt-4 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-text">
          <strong className="text-ok">سلم الحل / نموذج الإجابة: </strong>
          {question.answerKey}
        </div>
      )}

      {showAnswer && question.explanation && (
        <div className="mt-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-text">
          <strong className="text-light-gold">الشرح والتوضيح: </strong>
          {question.explanation}
        </div>
      )}
    </div>
  )
}
