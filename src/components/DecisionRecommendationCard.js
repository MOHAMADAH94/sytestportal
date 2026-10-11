import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const STATUS_STYLES = {
    qualified: {
        border: 'border-ok/40',
        bg: 'bg-ok/10',
        text: 'text-ok',
    },
    conditional: {
        border: 'border-warn/40',
        bg: 'bg-warn/10',
        text: 'text-warn',
    },
    not_qualified: {
        border: 'border-error/40',
        bg: 'bg-error/10',
        text: 'text-error',
    },
    incomplete: {
        border: 'border-line',
        bg: 'bg-panel/60',
        text: 'text-mute',
    },
};
export function DecisionRecommendationCard({ decision }) {
    const style = STATUS_STYLES[decision.status] || STATUS_STYLES.incomplete;
    const categories = Object.values(decision.categoryBreakdown || {});
    return (_jsxs("section", { className: `space-y-4 rounded-2xl border ${style.border} ${style.bg} p-5 shadow-[0_0_24px_rgba(193,165,118,0.12)]`, dir: "rtl", "aria-label": "\u062A\u0642\u062F\u064A\u0631 \u0627\u0644\u062C\u062F\u0627\u0631\u0629 \u2014 \u062A\u0648\u0635\u064A\u0629 \u0623\u0647\u0644\u064A\u0629 \u0627\u0644\u0645\u0631\u0634\u062D", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "mb-2 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-[11px] font-extrabold tracking-wide text-light-gold", children: "\u062A\u0642\u062F\u064A\u0631 \u0627\u0644\u062C\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0624\u0633\u0633\u064A \u0644\u0644\u0645\u0631\u0634\u062D :" }), _jsx("p", { className: "text-sm font-bold text-gold", children: "\u062A\u0642\u062F\u064A\u0631 \u0627\u0644\u062C\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0624\u0633\u0633\u064A" }), _jsx("p", { className: `mt-1 text-3xl font-extrabold ${style.text}`, children: decision.labelAr }), _jsx("p", { className: "mt-1 text-xs text-mute", children: "\u062A\u062D\u0644\u064A\u0644 \u0645\u0631\u0643\u0651\u0628 \u0644\u0645\u0633\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u062D\u0633\u0628 \u0635\u0646\u0641 \u0627\u0644\u0641\u0631\u0632" }), _jsx("p", { className: "mt-2 text-xs text-mute", children: decision.disclaimerAr })] }), _jsxs("div", { className: "text-left", children: [_jsx("p", { className: "text-xs font-bold text-mute", children: "\u0627\u0644\u062F\u0631\u062C\u0629 \u0627\u0644\u0645\u0631\u0643\u0651\u0628\u0629" }), _jsx("p", { className: "text-2xl font-extrabold text-light-gold", children: decision.compositePercent != null ? `${decision.compositePercent}%` : '—' }), _jsx("p", { className: "mt-1 text-[11px] text-mute", children: decision.policyVersion })] })] }), categories.length > 0 && (_jsx("div", { className: "grid gap-2 sm:grid-cols-2 lg:grid-cols-4", children: categories.map((item) => (_jsxs("div", { className: "rounded-xl border border-line/60 bg-card/50 px-3 py-2 text-sm", children: [_jsx("div", { className: "font-bold text-text", children: item.labelAr }), _jsxs("div", { className: "mt-1 flex items-baseline justify-between gap-2", children: [_jsx("span", { className: item.belowFloor ? 'font-bold text-warn' : 'font-bold text-light-gold', children: item.percent != null ? `${item.percent}%` : '—' }), _jsx("span", { className: "text-[11px] text-mute", children: item.status === 'pending'
                                        ? 'معلّق'
                                        : item.status === 'missing'
                                            ? 'ناقص'
                                            : `وزن ${Math.round(item.weight * 100)}%` })] })] }, item.category))) })), decision.reasons?.length > 0 && (_jsx("ul", { className: "list-disc space-y-1 pr-5 text-sm text-text", children: decision.reasons.map((reason) => (_jsx("li", { children: reason }, reason))) }))] }));
}
