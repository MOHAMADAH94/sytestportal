import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
export class AppErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('app-render-error', error, info.componentStack);
    }
    render() {
        if (!this.state.error)
            return this.props.children;
        return (_jsx("main", { dir: "rtl", className: "min-h-screen bg-void p-6 text-text", children: _jsxs("div", { className: "mx-auto max-w-2xl rounded-2xl border border-error/60 bg-panel p-6 shadow-xl", children: [_jsx("h1", { className: "text-xl font-extrabold text-error", children: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u0645\u0646\u0635\u0629" }), _jsx("p", { className: "mt-3 leading-7 text-mute", children: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0648\u0627\u062C\u0647\u0629. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629\u060C \u0648\u0625\u0630\u0627 \u0627\u0633\u062A\u0645\u0631 \u0627\u0644\u062E\u0637\u0623 \u0623\u0631\u0633\u0644 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0644\u0644\u0645\u0637\u0648\u0631." }), _jsx("pre", { className: "mt-4 overflow-auto rounded-xl bg-ink p-4 text-left text-xs text-light-gold", dir: "ltr", children: this.state.error.message })] }) }));
    }
}
