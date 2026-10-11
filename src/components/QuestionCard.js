import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const SCALE_LABELS = ['1 غير موافق بشدة', '2', '3 محايد', '4', '5 موافق بشدة'];
export function QuestionCard({ question, index, value, onChange, showAnswer, readOnly, hideMeta, }) {
    const isMultiChoice = Array.isArray(question.correctAnswer);
    const handleChoiceToggle = (choiceId) => {
        if (readOnly)
            return;
        if (isMultiChoice) {
            const currentList = Array.isArray(value) ? [...value] : (typeof value === 'string' && value ? [value] : []);
            const nextList = currentList.includes(choiceId)
                ? currentList.filter((id) => id !== choiceId)
                : [...currentList, choiceId];
            onChange?.(nextList);
        }
        else {
            onChange?.(choiceId);
        }
    };
    return (_jsxs("div", { className: "rounded-2xl border border-line bg-card p-5", children: [_jsxs("div", { className: "mb-3 flex flex-wrap items-start justify-between gap-2", children: [_jsxs("h3", { className: "text-base font-bold leading-relaxed text-text", children: [_jsx("span", { className: "ml-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gold/20 text-sm text-light-gold", children: index + 1 }), question.text] }), !hideMeta && (_jsxs("div", { className: "flex flex-wrap gap-2 text-xs", children: [_jsx("span", { className: "rounded-full border border-line bg-panel px-2.5 py-1 font-medium text-mute", children: question.type === 'classic' ? 'سؤال مقالي' : question.topic }), _jsxs("span", { className: "rounded-full border border-line bg-ink px-2.5 py-1 font-medium text-warn", children: [question.points, " \u062F\u0631\u062C\u0629"] }), isMultiChoice && (_jsx("span", { className: "rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs text-gold", children: "\u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0625\u062C\u0627\u0628\u0627\u062A" }))] }))] }), (question.type === 'mcq' || question.type === 'true_false') && question.choices && (_jsx("div", { className: "space-y-2", children: question.choices.map((c) => {
                    const isSelected = isMultiChoice
                        ? (Array.isArray(value) ? value.includes(c.id) : value === c.id)
                        : value === c.id;
                    const isCorrect = showAnswer && (isMultiChoice
                        ? Array.isArray(question.correctAnswer) && question.correctAnswer.includes(c.id)
                        : question.correctAnswer === c.id);
                    return (_jsxs("label", { className: `flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${isCorrect
                            ? 'border-ok/60 bg-ok/10'
                            : isSelected
                                ? 'border-gold bg-gold/10'
                                : 'border-line hover:border-gold/60 hover:bg-panel'} ${readOnly ? 'cursor-default' : ''}`, children: [_jsx("input", { type: isMultiChoice ? 'checkbox' : 'radio', name: isMultiChoice ? `${question.id}-${c.id}` : question.id, className: "accent-gold h-4 w-4 rounded", checked: isSelected, disabled: readOnly, onChange: () => handleChoiceToggle(c.id) }), _jsx("span", { className: "flex-1 text-sm font-medium leading-6 text-text-2", children: c.text })] }, c.id));
                }) })), (question.type === 'open' || question.type === 'oral' || question.type === 'classic') && (_jsxs("div", { className: "space-y-3", children: [_jsx("textarea", { className: "mt-1 w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm text-text outline-none placeholder:text-mute focus:border-gold", rows: question.type === 'classic' ? 6 : 4, placeholder: question.type === 'oral' && !hideMeta
                            ? 'ملاحظات المقيّم / نقاط الإجابة الشفهية...'
                            : question.type === 'classic'
                                ? 'اكتب إجابتك المقالية المفصلة هنا (تخضع للتقييم اليدوي وفق المعايير)...'
                                : 'اكتب إجابتك هنا...', value: typeof value === 'string' || typeof value === 'number' ? String(value) : '', disabled: readOnly, onChange: (e) => onChange?.(e.target.value) }), question.rubric && question.rubric.length > 0 && (_jsxs("div", { className: "rounded-xl border border-line/60 bg-panel/60 p-3 text-xs", children: [_jsx("div", { className: "mb-1 font-semibold text-text-2", children: "\u0645\u0639\u0627\u064A\u064A\u0631 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 (Rubric):" }), _jsx("ul", { className: "space-y-1 text-mute", children: question.rubric.map((r, idx) => (_jsxs("li", { className: "flex justify-between", children: [_jsxs("span", { children: ["\u2022 ", r.criterion] }), _jsxs("span", { className: "text-warn", children: [r.maxPoints, " \u062F\u0631\u062C\u0629"] })] }, idx))) })] }))] })), question.type === 'scale' && (_jsx("div", { className: "flex flex-wrap gap-2", children: SCALE_LABELS.map((label, i) => {
                    const v = i + 1;
                    const selected = Number(value) === v;
                    return (_jsx("button", { type: "button", disabled: readOnly, onClick: () => onChange?.(v), className: `rounded-xl border px-3 py-2 text-sm font-semibold transition ${selected
                            ? 'border-gold bg-gold text-ink'
                            : 'border-line bg-panel text-text-2 hover:border-gold/60'}`, children: label }, v));
                }) })), showAnswer && question.answerKey && (_jsxs("div", { className: "mt-4 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-text", children: [_jsx("strong", { className: "text-ok", children: "\u0633\u0644\u0645 \u0627\u0644\u062D\u0644 / \u0646\u0645\u0648\u0630\u062C \u0627\u0644\u0625\u062C\u0627\u0628\u0629: " }), question.answerKey] })), showAnswer && question.explanation && (_jsxs("div", { className: "mt-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-text", children: [_jsx("strong", { className: "text-light-gold", children: "\u0627\u0644\u0634\u0631\u062D \u0648\u0627\u0644\u062A\u0648\u0636\u064A\u062D: " }), question.explanation] }))] }));
}
