import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Plus, Save, Users } from 'lucide-react';
import { apiCommittee, apiListEvaluationCandidates, apiListExams } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { CATEGORY_META } from '../data/types';
import { oralRolesCompatible } from '../../shared/jobProfiles.js';
import { candidateVisibleToOperator } from '../../shared/evaluationMatrix.js';
import { COMMITTEE_LANES } from '../../shared/committeeCatalog.js';
import { ApplicantCombobox } from '../components/ApplicantCombobox';
import { RosterCards } from '../components/RosterCards';
/** أنواع التقييم التي يختارها الأدمن فقط — طريقة التنفيذ تختارها اللجنة */
/** أنواع التقييم — من جدول اللجان، بلا حسابات متقاعدة */
const ADMIN_TRACKS = COMMITTEE_LANES.filter((lane) => lane.toCommittee).map((lane) => ({
    ...lane,
    category: lane.category,
}));
const input = 'w-full rounded-xl border border-line bg-void px-3 py-2.5 text-sm text-text outline-none focus:border-gold disabled:opacity-50';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-ink disabled:opacity-40';
const secondary = 'rounded-xl border border-line px-4 py-2.5 text-sm text-text disabled:opacity-40';
const roleLabel = (role) => (role === 'committee_manager' ? 'مدير اللجنة' : 'عضو اللجنة');
const errorText = (error) => (error instanceof Error ? error.message : 'تعذر الاتصال بالخادم');
const trackLabel = (committee) => {
    const owner = committee.ownerUsername || committee.owner_username;
    if (owner) {
        const byOwner = ADMIN_TRACKS.find((t) => t.ownerUsername === owner);
        if (byOwner)
            return byOwner.label;
    }
    const role = committee.oralRole || committee.oral_role || null;
    const hit = ADMIN_TRACKS.find((t) => t.category === committee.category && (t.oralRole || null) === (role || null));
    return hit?.label || CATEGORY_META[(committee.category || 'oral')]?.label || '—';
};
const QUESTION_FORMATS = {
    theory: [
        { id: 'mixed', label: 'مزيج من البنك', types: [] },
        { id: 'mcq', label: 'اختيار من متعدد', types: ['mcq', 'true_false'] },
        { id: 'written', label: 'أسئلة كتابية', types: ['open', 'classic'] },
    ],
    oral: [
        { id: 'oral', label: 'مقابلة شفهية', types: ['oral'] },
        { id: 'mcq', label: 'اختيار من متعدد', types: ['mcq', 'true_false'] },
        { id: 'written', label: 'أسئلة كتابية', types: ['open', 'classic'] },
        { id: 'mixed', label: 'مزيج من البنك', types: [] },
    ],
    driving: [
        { id: 'mcq', label: 'اختيار من متعدد', types: ['mcq', 'true_false'] },
        { id: 'written', label: 'أسئلة كتابية', types: ['open', 'classic'] },
        { id: 'mixed', label: 'مزيج من البنك', types: [] },
    ],
    personality: [
        { id: 'scale', label: 'مقياس السمات', types: ['scale'] },
        { id: 'written', label: 'أسئلة كتابية / معرفية', types: ['open', 'classic'] },
    ],
};
const DEFAULT_SECONDS = { oral: 300, driving: 300, personality: 90, theory: 60 };
function defaultDurationMinutes(category, questionCount) {
    const perQ = DEFAULT_SECONDS[category || ''] || 180;
    return Math.max(1, Math.min(600, Math.round((perQ * Math.max(1, questionCount)) / 60)));
}
function defaultFormatId(category) {
    if (category === 'personality')
        return 'scale';
    if (category === 'oral')
        return 'oral';
    if (category === 'theory')
        return 'mixed';
    return 'mixed';
}
function suggestedWeights(members) {
    const count = members.filter((member) => member.active).length;
    const managerWeight = count === 1 ? 10000 : count === 2 ? 6000 : 4000;
    const others = count - 1;
    let remainder = others ? (10000 - managerWeight) % others : 0;
    return members.map((member) => ({
        ...member,
        weight: !member.active
            ? 0
            : member.role === 'committee_manager'
                ? managerWeight / 100
                : (Math.floor((10000 - managerWeight) / others) + (remainder-- > 0 ? 1 : 0)) / 100,
    }));
}
export function CommitteesPage() {
    const { user } = useAuth();
    const [list, setList] = useState([]);
    const [selected, setSelected] = useState('');
    const [committee, setCommittee] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [createVisible, setCreateVisible] = useState(false);
    const [draft, setDraft] = useState({
        name: '',
        managerName: '',
        username: '',
        password: '',
        trackId: 'oral_tech',
    });
    const token = user.token;
    const admin = user.role === 'admin';
    const ownerOperator = user.role === 'operator' && ['theory', 'oral', 'driving', 'personality'].includes(user.category || '');
    const manage = admin || ownerOperator || user.role === 'committee_manager';
    const loadList = useCallback(async () => {
        const result = await apiCommittee(token, '/committees');
        setList(result);
        setSelected((value) => value || result[0]?.id || '');
    }, [token]);
    useEffect(() => {
        let active = true;
        apiCommittee(token, '/committees')
            .then((result) => {
            if (active) {
                setList(result);
                setSelected((value) => value || result[0]?.id || '');
            }
        })
            .catch((err) => {
            if (active)
                setError(errorText(err));
        })
            .finally(() => {
            if (active)
                setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [token]);
    const refresh = useCallback(async () => {
        if (selected)
            setCommittee(await apiCommittee(token, `/committees/${selected}`));
    }, [token, selected]);
    useEffect(() => {
        let active = true;
        if (selected) {
            apiCommittee(token, `/committees/${selected}`)
                .then((result) => {
                if (active) {
                    setCommittee(result);
                    setError('');
                }
            })
                .catch((err) => {
                if (active)
                    setError(errorText(err));
            });
        }
        return () => {
            active = false;
        };
    }, [token, selected]);
    async function create(event) {
        event.preventDefault();
        setCreating(true);
        setError('');
        try {
            const result = await apiCommittee(token, '/committees', 'POST', { name: draft.name });
            setDraft({ name: '', managerName: '', username: '', password: '', trackId: 'oral_tech' });
            setCreateVisible(false);
            await loadList();
            setSelected(result.id);
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setCreating(false);
        }
    }
    return (_jsxs("div", { className: "space-y-6", dir: "rtl", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsxs("h1", { className: "flex items-center gap-2 text-2xl font-extrabold text-light-gold", children: [_jsx(Users, {}), " \u0644\u062C\u0646\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645"] }), _jsx("p", { className: "mt-2 text-sm text-mute", children: admin
                                    ? 'اللجان هي حسابات الدخول الجاهزة. الفرز من صفحة «فرز» حسب المصفوفة، ثم تنشئ اللجنة الاختبار من بنك الأسئلة.'
                                    : 'حدد عدد الأسئلة ونوعها والمدة. تُسحب الأسئلة من البنك بعدد واحد لكل المتقدمين المسندين.' })] }), ownerOperator && !list.length && (_jsxs("button", { className: button, onClick: () => setCreateVisible(!createVisible), children: [_jsx(Plus, { size: 18 }), " \u062A\u0634\u0643\u064A\u0644 \u0644\u062C\u0646\u062A\u064A"] })), admin && (_jsx(Link, { className: button, to: "/admin/create", children: "\u0641\u0631\u0632 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0644\u0644\u062D\u0633\u0627\u0628\u0627\u062A" }))] }), error && (_jsx("p", { role: "alert", className: "rounded-xl border border-error/40 bg-error/10 p-4 text-error", children: error })), createVisible && ownerOperator && (_jsxs("form", { onSubmit: create, className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [_jsx("h2", { className: "font-bold text-light-gold", children: "\u062A\u0634\u0643\u064A\u0644 \u0644\u062C\u0646\u062A\u064A" }), _jsxs("label", { className: "block space-y-2 text-sm text-text", children: [_jsx("span", { children: "\u0627\u0633\u0645 \u0627\u0644\u0644\u062C\u0646\u0629" }), _jsx("input", { required: true, maxLength: 120, className: input, value: draft.name, onChange: (event) => setDraft({ ...draft, name: event.target.value }) })] }), _jsxs("p", { className: "text-sm text-mute", children: ["\u0633\u062A\u0643\u0648\u0646 \u0631\u0626\u064A\u0633 \u0627\u0644\u0644\u062C\u0646\u0629 \u062A\u0644\u0642\u0627\u0626\u064A\u064B\u0627 \u0645\u0646 \u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u062D\u0627\u0644\u064A\u060C \u0648\u062A\u064F\u062E\u0635\u0635 \u0627\u0644\u0644\u062C\u0646\u0629 \u0644\u0640", CATEGORY_META[user.category].label, user.oralRole ? ' ولنطاقك الشفهي المحدد' : '', "."] }), _jsx("button", { className: button, disabled: creating, children: creating ? 'جاري الإنشاء…' : 'تشكيل اللجنة برئاستي' })] })), admin && !loading && (_jsxs("p", { className: "rounded-2xl border border-line bg-card p-4 text-sm text-mute", children: ["\u0644\u0627 \u062A\u064F\u0646\u0634\u0623 \u0644\u062C\u0627\u0646 \u0628\u0643\u0644\u0645\u0627\u062A \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629. \u0627\u0633\u062A\u062E\u062F\u0645", ' ', _jsx(Link, { className: "text-gold underline", to: "/admin/create", children: "\u0635\u0641\u062D\u0629 \u0627\u0644\u0641\u0631\u0632" }), ' ', "\u0644\u062A\u0645\u0631\u064A\u0631 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0625\u0644\u0649 theory / office / oral_prog / oral_net / oral_tech \u062B\u0645 \u0627\u062F\u062E\u0644 \u0628\u0630\u0644\u0643 \u0627\u0644\u062D\u0633\u0627\u0628."] })), loading ? (_jsx("p", { className: "text-mute", children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0644\u062C\u0627\u0646\u2026" })) : !list.length ? (_jsx("p", { className: "rounded-2xl border border-dashed border-line p-8 text-center text-mute", children: ownerOperator
                    ? 'لم تُهيأ لجنة لحسابك بعد. أعد تشغيل الخادم أو شكّل اللجنة من الزر أعلاه.'
                    : 'لم تُهيأ لجان الحسابات بعد. أعد تشغيل الخادم.' })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "block max-w-md space-y-2 text-sm text-text", children: [_jsx("span", { children: admin ? 'لجان الحسابات الجاهزة' : 'اللجنة' }), _jsx("select", { "aria-label": "\u0627\u0644\u0644\u062C\u0646\u0629", className: input, value: selected, onChange: (event) => setSelected(event.target.value), children: list.map((item) => (_jsxs("option", { value: item.id, children: [item.name, item.owner_username || item.ownerUsername
                                            ? ` — ${item.owner_username || item.ownerUsername}`
                                            : ` — ${trackLabel(item)}`] }, item.id))) })] }), committee?.id === selected && (_jsxs(_Fragment, { children: [_jsxs("p", { className: "text-sm text-mute", children: ["\u062D\u0633\u0627\u0628 \u0627\u0644\u0644\u062C\u0646\u0629:", ' ', _jsx("span", { className: "font-mono font-bold text-gold", children: committee.ownerUsername || '—' })] }), _jsx(MembersEditor, { committee: committee, token: token, manage: manage, refresh: refresh }, `${committee.id}-${committee.revision}`), admin && _jsx(AdminSortToCommitteePanel, { committee: committee, token: token, refresh: refresh }), !admin && (_jsx(CommitteeExamBuilder, { committee: committee, token: token, manage: manage, admin: admin, refresh: refresh })), _jsx(Assignments, { committee: committee, token: token, admin: admin, canAssign: false, manage: manage, accountId: ownerOperator ? `operator:${user.username}` : String(user.id || ''), refresh: refresh }, committee.id)] }))] }))] }));
}
function MembersEditor({ committee, token, manage, refresh }) {
    const [members, setMembers] = useState(committee.members);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const dirty = JSON.stringify(members.map(({ password: _p, ...rest }) => rest)) !== JSON.stringify(committee.members.map(({ password: _p, ...rest }) => rest));
    const total = Math.round(members.filter((m) => m.active).reduce((s, m) => s + m.weight, 0) * 100);
    const valid = total === 10000;
    return (_jsxs("form", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", onSubmit: async (event) => {
            event.preventDefault();
            setSaving(true);
            setError('');
            const missingPassword = members.some((member) => !member.id && !member.externalOwner && !String(member.password || '').trim());
            if (missingPassword) {
                setSaving(false);
                setError('أدخل كلمة مرور من 8 أحرف على الأقل لكل عضو جديد');
                return;
            }
            try {
                await apiCommittee(token, `/committees/${committee.id}/members`, 'PUT', { revision: committee.revision, members });
                await refresh();
            }
            catch (err) {
                setError(errorText(err));
            }
            finally {
                setSaving(false);
            }
        }, children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsx("h2", { className: "text-lg font-bold text-light-gold", children: "\u0623\u0639\u0636\u0627\u0621 \u0627\u0644\u0644\u062C\u0646\u0629 \u0648\u0627\u0644\u0623\u0648\u0632\u0627\u0646" }), manage && (_jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", className: secondary, onClick: () => setMembers(suggestedWeights(members)), children: "\u062A\u0648\u0632\u064A\u0639 \u0645\u0642\u062A\u0631\u062D" }), _jsxs("button", { type: "button", className: secondary, onClick: () => setMembers(suggestedWeights([...members, { name: '', username: '', role: 'committee_member', active: true, weight: 0, password: '' }])), children: [_jsx(Plus, { size: 16 }), " \u0639\u0636\u0648"] }), _jsxs("button", { className: button, disabled: !dirty || !valid || saving, children: [_jsx(Save, { size: 16 }), " ", saving ? 'جاري الحفظ…' : 'حفظ الأعضاء'] })] }))] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[640px] text-right text-sm", children: [_jsx("thead", { className: "text-mute", children: _jsx("tr", { children: ['الاسم', 'اسم المستخدم', 'الدور', 'نشط', 'الوزن %', 'كلمة مرور جديدة'].map((label) => (_jsx("th", { className: "p-3", children: label }, label))) }) }), _jsx("tbody", { children: members.map((member, index) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "p-2", children: _jsx("input", { className: input, disabled: !manage || !!member.externalOwner, value: member.name, onChange: (e) => setMembers(members.map((m, i) => (i === index ? { ...m, name: e.target.value } : m))) }) }), _jsx("td", { className: "p-2", children: _jsx("input", { className: input, disabled: !manage || !!member.externalOwner, value: member.username, onChange: (e) => setMembers(members.map((m, i) => (i === index ? { ...m, username: e.target.value } : m))) }) }), _jsx("td", { className: "p-3 text-mute", children: roleLabel(member.role) }), _jsx("td", { className: "p-3", children: _jsx("input", { type: "checkbox", disabled: !manage || member.role === 'committee_manager', checked: member.active, onChange: (e) => setMembers(members.map((m, i) => (i === index ? { ...m, active: e.target.checked, weight: e.target.checked ? m.weight : 0 } : m))) }) }), _jsx("td", { className: "p-2", children: _jsx("input", { type: "number", min: 0, max: 100, step: 0.01, className: input, disabled: !manage || !member.active, value: member.weight, onChange: (e) => setMembers(members.map((m, i) => (i === index ? { ...m, weight: Number(e.target.value) } : m))) }) }), _jsx("td", { className: "p-2", children: _jsx("input", { type: "password", className: input, disabled: !manage || !!member.externalOwner, placeholder: member.id ? 'اختياري' : 'مطلوبة', value: member.password || '', onChange: (e) => setMembers(members.map((m, i) => (i === index ? { ...m, password: e.target.value } : m))) }) })] }, member.id || index))) })] }) }), _jsxs("p", { className: `text-sm ${valid ? 'text-ok' : 'text-warn'}`, children: ["\u0645\u062C\u0645\u0648\u0639 \u0623\u0648\u0632\u0627\u0646 \u0627\u0644\u0646\u0634\u0637\u064A\u0646: ", (total / 100).toFixed(2), "% ", valid ? _jsx(CheckCircle2, { className: "inline", size: 14 }) : '(يجب 100%)'] }), dirty && _jsxs("p", { className: "text-sm text-warn", children: ["\u062A\u0639\u062F\u064A\u0644\u0627\u062A \u063A\u064A\u0631 \u0645\u062D\u0641\u0648\u0638\u0629. ", valid ? 'جاهزة للحفظ.' : 'لن يُسمح بالحفظ قبل أن يكون المجموع 100%.'] }), error && (_jsx("p", { role: "alert", className: "text-error", children: error }))] }));
}
function AdminSortToCommitteePanel({ committee, token, refresh, }) {
    const owner = committee.ownerUsername || null;
    const [pool, setPool] = useState([]);
    const [picked, setPicked] = useState([]);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const operatorView = useMemo(() => ({
        role: 'operator',
        category: (committee.category || 'oral'),
        oralRole: committee.oralRole || null,
        theoryTrack: committee.theory_track
            || (committee.ownerUsername === 'office'
                ? 'office'
                : ['theory', 'theory2'].includes(committee.ownerUsername || '')
                    ? 'general'
                    : null),
    }), [committee]);
    useEffect(() => {
        let active = true;
        apiListEvaluationCandidates(token)
            .then((rows) => {
            if (!active)
                return;
            const assigned = new Set((committee.candidates || []).map((c) => c.applicantId));
            setPool(rows.filter((a) => {
                if (assigned.has(a.id))
                    return false;
                if (!committee.category)
                    return true;
                return candidateVisibleToOperator(operatorView, a);
            }));
        })
            .catch((err) => {
            if (active)
                setError(errorText(err));
        });
        return () => {
            active = false;
        };
    }, [token, committee.id, committee.candidates, committee.category, operatorView]);
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q)
            return pool;
        return pool.filter((a) => [a.name, a.jobTitle, a.org, a.evaluationStreamLabel].filter(Boolean).some((s) => String(s).toLowerCase().includes(q)));
    }, [pool, search]);
    async function sortToCommittee() {
        if (!picked.length)
            return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const result = await apiCommittee(token, `/committees/${committee.id}/candidates`, 'POST', { applicantIds: picked });
            setMessage(`فُرز ${result.addedCount} متقدم إلى «${committee.name}»` +
                (result.skippedCount ? ` (تُجُوهل ${result.skippedCount})` : '') +
                (owner ? ` — ادخل بحساب «${owner}» لإنشاء الاختبار.` : ''));
            setPicked([]);
            await refresh();
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("section", { className: "space-y-4 rounded-2xl border border-gold/40 bg-gold/5 p-5", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-bold text-gold", children: "\u0641\u0631\u0632 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0644\u0647\u0630\u0647 \u0627\u0644\u0644\u062C\u0646\u0629 \u0641\u0642\u0637" }), _jsxs("p", { className: "mt-1 text-sm text-mute", children: ["\u0627\u0644\u0623\u062F\u0645\u0646 \u064A\u0641\u0631\u0632 \u0648\u064A\u064F\u0633\u0646\u062F \u0641\u0642\u0637 \u2014 \u0628\u062F\u0648\u0646 \u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631. ", owner ? `بعد الفرز يدخل حساب «${owner}» ويختار الطريقة.` : ''] })] }), (committee.candidates || []).length > 0 && (_jsxs("p", { className: "text-sm text-mute", children: ["\u0645\u0633\u0646\u062F\u0648\u0646 \u062D\u0627\u0644\u064A\u0627\u064B: ", (committee.candidates || []).length, " \u0645\u062A\u0642\u062F\u0645"] })), _jsx("input", { "aria-label": "\u0628\u062D\u062B \u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0644\u0644\u0641\u0631\u0632", className: input, placeholder: "\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u0633\u0645\u0649", value: search, onChange: (e) => setSearch(e.target.value) }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { type: "button", className: secondary, onClick: () => setPicked(visible.map((a) => a.id)), children: ["\u062A\u062D\u062F\u064A\u062F \u0627\u0644\u0638\u0627\u0647\u0631 (", visible.length, ")"] }), _jsx("button", { type: "button", className: secondary, onClick: () => setPicked([]), children: "\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u062D\u062F\u064A\u062F" })] }), _jsx("div", { className: "max-h-56 overflow-auto rounded-xl border border-line bg-card", children: !visible.length ? (_jsx("p", { className: "p-4 text-mute", children: "\u0644\u0627 \u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u062C\u0627\u0647\u0632\u064A\u0646 \u0644\u0644\u0641\u0631\u0632 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u0627\u0631 (\u0623\u0648 \u0633\u0628\u0642 \u0625\u0633\u0646\u0627\u062F\u0647\u0645)." })) : (_jsx("table", { className: "w-full text-right text-sm", children: _jsx("tbody", { children: visible.map((a) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "p-2", children: _jsx("input", { type: "checkbox", checked: picked.includes(a.id), onChange: (e) => setPicked((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id))) }) }), _jsx("td", { className: "p-2", children: a.name }), _jsx("td", { className: "p-2 text-mute", children: a.jobTitle || 'بلا مسمى' })] }, a.id))) }) })) }), _jsx("button", { type: "button", className: button, disabled: busy || !picked.length, onClick: () => void sortToCommittee(), children: busy ? 'جاري الفرز…' : `فرز ${picked.length} متقدم إلى اللجنة` }), message && _jsx("p", { className: "text-sm text-ok", children: message }), error && (_jsx("p", { role: "alert", className: "text-error", children: error })), _jsxs("p", { className: "text-xs text-mute", children: ["\u0623\u0648 \u0627\u0633\u062A\u062E\u062F\u0645", ' ', _jsx(Link, { className: "text-gold underline", to: "/admin/create", children: "\u0635\u0641\u062D\u0629 \u0627\u0644\u0641\u0631\u0632 \u062D\u0633\u0628 \u0627\u0644\u0645\u0633\u0627\u0631" }), "."] })] }));
}
function CommitteeExamBuilder({ committee, token, manage, admin, refresh, }) {
    const category = committee.category || 'oral';
    const formats = QUESTION_FORMATS[category] || QUESTION_FORMATS.oral;
    const [title, setTitle] = useState(`${committee.name} — ${new Date().toLocaleDateString('ar-SA')}`);
    const [questionCount, setQuestionCount] = useState(20);
    const [formatId, setFormatId] = useState(defaultFormatId(category));
    const [durationMinutes, setDurationMinutes] = useState(() => defaultDurationMinutes(category, 20));
    const [durationTouched, setDurationTouched] = useState(false);
    const [picked, setPicked] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [created, setCreated] = useState(null);
    const available = (committee.candidates || []).filter((c) => !c.covered && !c.missing);
    const canCreate = manage && !admin && !!committee.category;
    const selectedFormat = formats.find((f) => f.id === formatId) || formats[0];
    useEffect(() => {
        setPicked(available.map((c) => c.applicantId));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [committee.id, committee.candidates?.length]);
    useEffect(() => {
        setFormatId(defaultFormatId(category));
        setQuestionCount(20);
        setDurationMinutes(defaultDurationMinutes(category, 20));
        setDurationTouched(false);
    }, [category, committee.id]);
    function onQuestionCountChange(value) {
        const next = Math.max(1, Math.min(100, value || 1));
        setQuestionCount(next);
        if (!durationTouched)
            setDurationMinutes(defaultDurationMinutes(category, next));
    }
    if (admin) {
        return (_jsx("section", { className: "rounded-2xl border border-line bg-card p-5 text-sm text-mute", children: "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0648\u0627\u062E\u062A\u064A\u0627\u0631 \u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u064A\u062A\u0645 \u0645\u0646 \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631/\u0631\u0626\u064A\u0633 \u0627\u0644\u0644\u062C\u0646\u0629 \u0628\u0639\u062F \u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646." }));
    }
    if (!canCreate)
        return null;
    async function createExam() {
        setBusy(true);
        setError('');
        try {
            const result = await apiCommittee(token, `/committees/${committee.id}/exams`, 'POST', {
                title,
                applicantIds: picked,
                questionCount,
                questionTypes: selectedFormat?.types ?? [],
                durationMinutes,
            });
            setCreated(result);
            await refresh();
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("section", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [_jsx("h2", { className: "text-lg font-bold text-light-gold", children: "\u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0644\u062C\u0646\u0629" }), _jsx("p", { className: "text-sm text-mute", children: "\u062A\u064F\u0633\u062D\u0628 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u0645\u0646 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629 \u062D\u0633\u0628 \u0627\u0644\u0645\u0633\u0645\u0649\u060C \u0628\u0639\u062F\u062F \u0648\u0627\u062D\u062F \u0644\u0643\u0644 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646. \u062D\u062F\u062F \u0627\u0644\u0639\u062F\u062F \u0648\u0627\u0644\u0646\u0648\u0639 \u0648\u0627\u0644\u0645\u062F\u0629 \u062B\u0645 \u0623\u0646\u0634\u0626 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." }), !available.length ? (_jsxs("div", { className: "space-y-2 text-sm text-mute", children: [_jsx("p", { children: (committee.candidates || []).some((c) => c.covered)
                            ? 'المتقدمون المسندون لديهم اختبار على هذا المسار، لذلك لا يُنشأ لهم اختبار ثانٍ.'
                            : 'لا متقدمين مسندين بعد. الفرز يتم من حساب المسؤول.' }), !!committee.assignments?.length && (_jsx("p", { children: "\u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u062D\u0627\u0644\u064A \u0638\u0627\u0647\u0631 \u0641\u064A \u0627\u0644\u0642\u0633\u0645 \u0623\u062F\u0646\u0627\u0647. \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0630\u064A \u0628\u0644\u0627 \u0623\u0633\u0626\u0644\u0629 \u0644\u0627 \u064A\u0645\u0646\u0639 \u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u062C\u062F\u064A\u062F \u0645\u0646 \u0627\u0644\u0628\u0646\u0643." }))] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "block max-w-xl space-y-2 text-sm", children: [_jsx("span", { children: "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" }), _jsx("input", { className: input, value: title, maxLength: 200, onChange: (e) => setTitle(e.target.value) })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [_jsxs("label", { className: "block space-y-2 text-sm", children: [_jsx("span", { children: "\u0639\u062F\u062F \u0627\u0644\u0623\u0633\u0626\u0644\u0629" }), _jsx("input", { className: input, type: "number", min: 1, max: 100, value: questionCount, onChange: (e) => onQuestionCountChange(Number(e.target.value)) })] }), _jsxs("label", { className: "block space-y-2 text-sm", children: [_jsx("span", { children: "\u0627\u0644\u0645\u062F\u0629 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629 (\u062F\u0642\u064A\u0642\u0629)" }), _jsx("input", { className: input, type: "number", min: 1, max: 600, value: durationMinutes, onChange: (e) => {
                                            setDurationTouched(true);
                                            setDurationMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)));
                                        } }), _jsxs("span", { className: "text-xs text-mute", children: ["\u2248 ", Math.max(30, Math.floor((durationMinutes * 60) / Math.max(1, questionCount))), " \u062B\u0627\u0646\u064A\u0629 \u0644\u0643\u0644 \u0633\u0624\u0627\u0644"] })] }), _jsxs("div", { className: "block space-y-2 text-sm", children: [_jsx("span", { className: "block", children: "\u0646\u0648\u0639 \u0627\u0644\u0623\u0633\u0626\u0644\u0629" }), _jsx("div", { className: "flex flex-wrap gap-2", children: formats.map((f) => (_jsx("button", { type: "button", onClick: () => setFormatId(f.id), className: `rounded-xl border px-3 py-2 text-sm transition ${formatId === f.id ? 'border-gold bg-gold/10 text-gold' : 'border-line text-text hover:border-gold'}`, children: f.label }, f.id))) })] })] }), _jsx("div", { className: "max-h-48 overflow-auto rounded-xl border border-line", children: _jsx("table", { className: "w-full text-right text-sm", children: _jsx("tbody", { children: available.map((c) => (_jsxs("tr", { className: "border-t border-line", children: [_jsx("td", { className: "p-2", children: _jsx("input", { type: "checkbox", checked: picked.includes(c.applicantId), onChange: (e) => setPicked((prev) => (e.target.checked ? [...prev, c.applicantId] : prev.filter((id) => id !== c.applicantId))) }) }), _jsx("td", { className: "p-2", children: c.name }), _jsx("td", { className: "p-2 text-mute", children: c.jobTitle || 'بلا مسمى' })] }, c.applicantId))) }) }) }), _jsx("button", { className: button, disabled: busy || !picked.length || !title.trim(), onClick: () => void createExam(), children: busy ? 'جاري الإنشاء…' : `إنشاء من البنك (${questionCount} سؤال · ${durationMinutes} د) لـ ${picked.length} متقدم` })] })), error && (_jsx("p", { role: "alert", className: "text-error", children: error })), created && (_jsxs("div", { className: "space-y-3 rounded-2xl border border-ok/40 bg-ok/5 p-4", children: [_jsxs("p", { className: "font-bold text-ok", children: ["\u0623\u064F\u0646\u0634\u0626 \u00AB", created.exam.title, "\u00BB \u0645\u0646 \u0628\u0646\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629", created.questionCount != null ? ` — ${created.questionCount} سؤال` : '', created.durationMinutes != null ? ` — ${created.durationMinutes} دقيقة` : '', created.showsBarcode === false
                                ? ' — بلا باركود، لأن هذا المسار لا يحتاجه'
                                : ` — ${created.roster.length} بطاقة باركود`] }), !!created.warnings?.length && _jsx("ul", { className: "text-sm text-warn", children: created.warnings.map((w) => _jsx("li", { children: w }, w)) }), created.showsBarcode !== false && (_jsx(RosterCards, { examTitle: created.exam.title, showBarcode: true, publicAppUrl: created.publicAppUrl || window.location.origin, roster: created.roster
                            .filter((r) => !!r.qrToken && r.qrToken.length >= 40)
                            .map((r) => ({
                            id: r.id,
                            name: r.name,
                            displayId: r.displayId || '',
                            seqNumber: 0,
                            jobTitle: r.jobTitle || '',
                            demandTitle: r.demandTitle || '',
                            tracks: r.tracks || [],
                            qrToken: r.qrToken || '',
                            used: false,
                            extra: null,
                        })) })), created.showsBarcode !== false && !created.roster.some((r) => r.qrToken && r.qrToken.length >= 40) && (_jsx("p", { className: "text-sm text-warn", children: "\u062A\u0639\u0630\u0631 \u062A\u0636\u0645\u064A\u0646 \u0631\u0645\u0648\u0632 QR \u0641\u064A \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629. \u0627\u0641\u062A\u062D \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0645\u062A\u062D\u0646\u064A\u0646 \u0644\u0625\u0639\u0627\u062F\u0629 \u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0628\u0637\u0627\u0642\u0627\u062A." })), _jsx(Link, { className: "text-gold underline", to: `/admin/roster/${created.exam.id}`, children: created.showsBarcode === false ? 'فتح قائمة الممتحنين' : 'فتح قائمة الممتحنين والبطاقات' })] }))] }));
}
function Assignments({ committee, token, admin, canAssign, manage, accountId, refresh, }) {
    const [exams, setExams] = useState([]);
    const [examId, setExamId] = useState('');
    const [assignmentId, setAssignmentId] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (canAssign)
            apiListExams(token).then(setExams).catch((err) => setError(errorText(err)));
    }, [token, canAssign]);
    async function assign() {
        setBusy(true);
        setError('');
        try {
            await apiCommittee(token, `/committees/${committee.id}/assignments`, 'POST', { examId });
            await refresh();
            setExamId('');
        }
        catch (err) {
            setError(errorText(err));
        }
        finally {
            setBusy(false);
        }
    }
    const selected = assignmentId || committee.assignments[0]?.id || '';
    return (_jsxs("section", { className: "space-y-4", children: [_jsx("h2", { className: "text-lg font-bold text-light-gold", children: "\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0644\u062C\u0646\u0629 \u0648\u062F\u0631\u062C\u0627\u062A \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646" }), canAssign && (_jsxs("div", { className: "space-y-3 rounded-2xl border border-line p-4", children: [_jsx("p", { className: "text-sm text-mute", children: "\u0631\u0628\u0637 \u0627\u062E\u062A\u0628\u0627\u0631 \u0642\u062F\u064A\u0645 (\u0645\u0633\u0627\u0631 \u062A\u0631\u0627\u062B\u064A). \u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0645\u0639\u062A\u0645\u062F: \u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u062B\u0645 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0646 \u0627\u0644\u0644\u062C\u0646\u0629." }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsxs("select", { "aria-label": "\u0627\u062E\u062A\u0628\u0627\u0631 \u0644\u0631\u0628\u0637\u0647 \u0628\u0627\u0644\u0644\u062C\u0646\u0629", className: `${input} sm:max-w-md`, value: examId, onChange: (event) => setExamId(event.target.value), children: [_jsx("option", { value: "", children: "\u0627\u062E\u062A\u0631 \u0627\u062E\u062A\u0628\u0627\u0631\u064B\u0627" }), exams
                                        .filter((exam) => exam.active &&
                                        exam.usedSeats === 0 &&
                                        (!committee.category || exam.category === committee.category) &&
                                        (!committee.oralRole || (exam.oralRole && oralRolesCompatible(committee.oralRole, exam.oralRole))) &&
                                        !committee.assignments.some((item) => item.examId === exam.id))
                                        .map((exam) => (_jsxs("option", { value: exam.id, children: [exam.title, " \u2014 ", CATEGORY_META[exam.category].label] }, exam.id)))] }), _jsx("button", { className: button, disabled: !examId || busy, onClick: () => void assign(), children: "\u0631\u0628\u0637 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0628\u0627\u0644\u0644\u062C\u0646\u0629" })] })] })), error && (_jsx("p", { role: "alert", className: "text-error", children: error })), !committee.assignments.length ? (_jsx("p", { className: "text-mute", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0639\u062F. \u0623\u0646\u0634\u0626 \u0627\u062E\u062A\u0628\u0627\u0631\u0627\u064B \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0644\u062C\u0646\u0629 \u0623\u0639\u0644\u0627\u0647." })) : (_jsxs(_Fragment, { children: [_jsx("select", { "aria-label": "\u0627\u062E\u062A\u0628\u0627\u0631 \u0627\u0644\u0644\u062C\u0646\u0629", className: `${input} max-w-lg`, value: selected, onChange: (event) => setAssignmentId(event.target.value), children: committee.assignments.map((item) => (_jsxs("option", { value: item.id, children: [item.title, " \u2014 ", CATEGORY_META[item.category].label] }, item.id))) }), _jsx(EvaluationPanel, { assignmentId: selected, committee: committee, token: token, manage: manage, accountId: accountId, admin: admin }, `${selected}-${committee.revision}`)] }))] }));
}
function EvaluationPanel({ assignmentId, committee, token, manage, accountId, admin, }) {
    const [data, setData] = useState(null);
    const rememberKey = `committee-examinee:${assignmentId}`;
    const [name, setName] = useState(() => sessionStorage.getItem(rememberKey) || '');
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const refresh = useCallback(async () => {
        const result = await apiCommittee(token, `/committee-assignments/${assignmentId}`);
        setData(result);
        return result;
    }, [token, assignmentId]);
    useEffect(() => {
        let active = true;
        apiCommittee(token, `/committee-assignments/${assignmentId}`)
            .then((result) => {
            if (active)
                setData(result);
        })
            .catch((err) => {
            if (active)
                setError(errorText(err));
        });
        return () => {
            active = false;
        };
    }, [token, assignmentId]);
    const adoptedNames = useMemo(() => new Set((data?.results ?? []).map((result) => result.examineeName)), [data]);
    const pending = useMemo(() => (data?.candidates ?? []).filter((candidate) => !adoptedNames.has(candidate.name)), [data, adoptedNames]);
    const selectedName = pending.some((candidate) => candidate.name === name) ? name : '';
    const applicantOptions = useMemo(() => pending.map((candidate) => ({
        id: candidate.displayId || candidate.name,
        name: candidate.name,
        label: `${candidate.displayId} — ${candidate.name}`,
    })), [pending]);
    useEffect(() => {
        if (name)
            sessionStorage.setItem(rememberKey, name);
        else
            sessionStorage.removeItem(rememberKey);
    }, [name, rememberKey]);
    useEffect(() => {
        if (!name || !adoptedNames.has(name))
            return;
        setNotice(`اعتُمدت علامة ${name} وأُزيل الاسم من القائمة.`);
        setName('');
    }, [adoptedNames, name]);
    const assignment = committee.assignments.find((a) => a.id === assignmentId);
    return (_jsxs("div", { className: "space-y-4 rounded-2xl border border-line bg-card p-5", children: [assignment && (assignment.emptySets || 0) > 0 && (_jsx("p", { className: "rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn", children: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631 \u0628\u0644\u0627 \u0623\u0633\u0626\u0644\u0629\u060C \u0644\u0630\u0644\u0643 \u0644\u0627 \u064A\u0645\u0646\u0639 \u0625\u0646\u0634\u0627\u0621 \u0627\u062E\u062A\u0628\u0627\u0631 \u062C\u062F\u064A\u062F \u0645\u0646 \u0627\u0644\u0628\u0646\u0643 \u0623\u0639\u0644\u0627\u0647." })), notice && _jsx("p", { className: "text-sm text-ok", children: notice }), data?.objectiveExam && (_jsxs("div", { className: "space-y-2 rounded-xl border border-gold/40 bg-gold/5 p-4", children: [_jsx("h3", { className: "font-bold text-gold", children: "\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646 \u0645\u062A\u0639\u062F\u062F" }), _jsx("p", { className: "text-sm text-mute", children: "\u062A\u064F\u062D\u0633\u0628 \u0622\u0644\u064A\u0627\u064B \u0648\u062A\u0638\u0647\u0631 \u0644\u0644\u0645\u062A\u0642\u062F\u0645 \u0628\u0639\u062F \u0627\u0644\u062A\u0633\u0644\u064A\u0645 \u0648\u0644\u0644\u062C\u0646\u0629 \u0647\u0646\u0627." }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-right text-sm", children: [_jsx("thead", { className: "text-mute", children: _jsxs("tr", { children: [_jsx("th", { className: "p-2", children: "\u0627\u0644\u0645\u062A\u0642\u062F\u0645" }), _jsx("th", { className: "p-2", children: "\u0627\u0644\u0639\u0644\u0627\u0645\u0629" })] }) }), _jsx("tbody", { children: data.candidates.map((candidate) => {
                                        const auto = data.objectiveScores?.find((score) => score.examineeName === candidate.name);
                                        return (_jsxs("tr", { className: "border-t border-line", children: [_jsxs("td", { className: "p-2", children: [candidate.displayId, " \u2014 ", candidate.name] }), _jsx("td", { className: "p-2 font-bold text-light-gold", children: auto ? `${auto.score} / ${auto.maxScore} (${auto.percent}%)` : 'لم يسلّم بعد' })] }, candidate.name));
                                    }) })] }) })] })), !data ? null : pending.length === 0 && data.candidates.length > 0 ? (_jsx("p", { className: "rounded-xl bg-ok/10 p-4 text-sm font-bold text-ok", children: "\u0627\u0639\u062A\u064F\u0645\u062F\u062A \u0639\u0644\u0627\u0645\u0627\u062A \u062C\u0645\u064A\u0639 \u0627\u0644\u0645\u062A\u0642\u062F\u0645\u064A\u0646 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." })) : pending.length === 0 ? (_jsx("p", { className: "text-sm text-mute", children: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u062A\u0642\u062F\u0645\u0648\u0646 \u0641\u064A \u0647\u0630\u0627 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631." })) : (_jsxs("div", { className: "flex flex-wrap items-end gap-3", children: [_jsxs("label", { className: "min-w-[16rem] flex-1 space-y-2 text-sm text-text", children: [_jsx("span", { children: "\u0627\u0644\u0645\u062A\u0642\u062F\u0645" }), _jsx(ApplicantCombobox, { className: input, options: applicantOptions, value: selectedName, onChange: setName })] }), _jsx("button", { className: `${secondary} self-end`, onClick: () => void refresh().catch((err) => setError(errorText(err))), children: "\u062A\u062D\u062F\u064A\u062B \u062F\u0631\u062C\u0627\u062A \u0627\u0644\u0623\u0639\u0636\u0627\u0621" })] })), error && (_jsx("p", { role: "alert", className: "text-error", children: error })), selectedName && committee.assignments.find((a) => a.id === assignmentId)?.category !== 'theory' && (_jsx(Link, { className: button, to: '/evaluation/' + committee.assignments.find((a) => a.id === assignmentId)?.examId + '?name=' + encodeURIComponent(selectedName), children: "\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631" })), data && selectedName && (_jsx(CandidateEvaluation, { assignmentId, committee, token, manage, accountId, admin, data, refresh, name: selectedName }, selectedName))] }));
}
function CandidateEvaluation({ assignmentId, committee, token, manage, accountId, admin, data, refresh, name, }) {
    const [questions, setQuestions] = useState([]);
    const [questionError, setQuestionError] = useState('');
    useEffect(() => {
        let current = true;
        apiCommittee(token, '/committee-assignments/' + assignmentId + '/questions?examineeName=' + encodeURIComponent(name))
            .then((res) => {
            if (current)
                setQuestions(res.questions);
        })
            .catch((e) => {
            if (current)
                setQuestionError(e.message);
        });
        return () => {
            current = false;
        };
    }, [assignmentId, name, token]);
    const mine = data.scores.find((score) => score.examineeName === name && score.accountId === accountId);
    const objectiveScore = data.objectiveScores?.find((score) => score.examineeName === name);
    const [value, setValue] = useState(mine?.percent.toString() ?? '');
    const [note, setNote] = useState('');
    const [salary, setSalary] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const final = data.results.find((result) => result.examineeName === name);
    const rows = final
        ? final.snapshot
        : committee.members
            .filter((member) => member.active)
            .map((member) => {
            const score = data.scores.find((entry) => entry.examineeName === name && entry.accountId === member.id)?.percent;
            return { name: member.name, username: member.username, role: member.role, weight: member.weight, score, contribution: score === undefined ? undefined : (score * member.weight) / 100 };
        });
    const allowSalary = committee.category === 'oral';
    const complete = rows.length > 0 && rows.every((row) => row.score !== undefined);
    const total = rows.reduce((sum, row) => sum + (row.contribution || 0), 0);
    async function saveScore() {
        await apiCommittee(token, `/committee-assignments/${assignmentId}/score`, 'PUT', {
            examineeName: name,
            percent: Number(value),
        });
    }
    async function act(publish = false) {
        setBusy(true);
        setError('');
        try {
            if (publish && manage) {
                if (!admin && value !== '')
                    await saveScore();
                const latest = await refresh();
                await apiCommittee(token, `/committee-assignments/${assignmentId}/publish`, 'POST', {
                    examineeName: name,
                    revision: committee.revision,
                    scoreVersion: latest.candidates.find((candidate) => candidate.name === name)?.scoreVersion,
                    note: note.trim(),
                    estimatedSalary: allowSalary && salary.trim() !== '' ? Number(salary) : null,
                });
                await refresh();
            }
            else {
                await saveScore();
                await refresh();
            }
        }
        catch (err) {
            setError(errorText(err));
            await refresh().catch(() => undefined);
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "space-y-4", children: [questionError && (_jsx("p", { role: "alert", className: "text-error", children: questionError })), objectiveScore && (_jsxs("p", { className: "rounded-xl border border-gold/40 bg-gold/10 p-3 font-bold text-light-gold", children: ["\u0639\u0644\u0627\u0645\u0629 \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u0646 \u0645\u062A\u0639\u062F\u062F: ", objectiveScore.score, " / ", objectiveScore.maxScore, " (", objectiveScore.percent, "%)"] })), questions.length > 0 && (_jsxs("details", { className: "rounded-xl border border-line p-4", children: [_jsxs("summary", { className: "cursor-pointer font-bold text-gold", children: ["\u0623\u0633\u0626\u0644\u0629 \u0627\u0644\u0645\u062A\u0642\u062F\u0645 \u0648\u0645\u0639\u0627\u064A\u064A\u0631 \u0627\u0644\u062A\u0642\u064A\u064A\u0645 (", questions.length, ")"] }), questions.map((q, i) => (_jsxs("article", { className: "mt-4 space-y-2 border-t border-line pt-3", children: [_jsxs("p", { className: "font-bold", children: [i + 1, ". ", q.text, " (", q.points, " \u062F\u0631\u062C\u0629)"] }), q.choices?.map((c) => (_jsxs("p", { children: [c.text, c.id === q.correctAnswer ? ' ✓' : ''] }, c.id))), _jsx("p", { className: "whitespace-pre-wrap text-sm text-mute", children: q.answerKey }), q.rubric?.map((r, n) => (_jsxs("p", { className: "text-sm", children: [r.criterion, " \u2014 ", r.maxPoints, " \u062F\u0631\u062C\u0629"] }, n)))] }, q.id)))] })), !admin && !final && !manage && (_jsxs("form", { className: "flex flex-wrap items-end gap-3", onSubmit: (event) => {
                    event.preventDefault();
                    void act();
                }, children: [_jsxs("label", { className: "space-y-2 text-sm text-text", children: [_jsx("span", { children: "\u062F\u0631\u062C\u062A\u0643 \u0644\u0644\u0645\u062A\u0642\u062F\u0645 \u0645\u0646 100" }), _jsx("input", { "aria-label": "\u062F\u0631\u062C\u062A\u0643 \u0644\u0644\u0645\u062A\u0642\u062F\u0645 \u0645\u0646 100", required: true, type: "number", min: "0", max: "100", step: "0.01", className: input, value: value, onChange: (event) => setValue(event.target.value) })] }), _jsx("button", { className: button, type: "submit", disabled: busy || value === '', children: busy ? 'جاري الحفظ…' : 'حفظ درجتي' }), mine && _jsxs("span", { className: "text-sm text-ok", children: ["\u062F\u0631\u062C\u062A\u0643 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629: ", mine.percent, "/100"] })] })), manage && (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full min-w-[450px] text-right text-sm", children: [_jsx("thead", { className: "text-mute", children: _jsx("tr", { children: ['العضو', 'الوزن', 'الدرجة /100', 'المساهمة'].map((label) => (_jsx("th", { className: "p-3", children: label }, label))) }) }), _jsx("tbody", { children: rows.map((row, index) => (_jsxs("tr", { className: "border-t border-line text-text", children: [_jsxs("td", { className: "p-3", children: [row.name, row.username ? _jsxs("span", { className: "mr-2 font-mono text-xs text-gold", children: ["@", row.username] }) : null, _jsx("span", { className: "mr-2 text-xs text-mute", children: roleLabel(row.role) })] }), _jsxs("td", { className: "p-3", children: [row.weight, "%"] }), _jsx("td", { className: "p-3", children: row.score ?? 'بانتظار التقييم' }), _jsx("td", { className: "p-3", children: row.contribution?.toFixed(2) ?? '—' })] }, index))) })] }) })), final ? (_jsxs("div", { className: "space-y-2 rounded-xl bg-ok/10 p-4 text-ok", children: [_jsxs("p", { className: "font-bold", children: ["\u0627\u0644\u0646\u062A\u064A\u062C\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629: ", final.percent, "/100 \u2014 ", new Date(final.publishedAt).toLocaleString('ar-SA')] }), final.note && _jsxs("p", { className: "text-sm text-text", children: ["\u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629: ", final.note] }), allowSalary && final.estimatedSalary != null && _jsxs("p", { className: "text-sm text-text", children: ["\u0627\u0644\u0631\u0627\u062A\u0628 \u0627\u0644\u0645\u0642\u062F\u0631: ", final.estimatedSalary.toLocaleString('ar-SY')] })] })) : (manage && (_jsxs("form", { className: "space-y-3 rounded-xl border border-line p-4", onSubmit: (event) => {
                    event.preventDefault();
                    void act(true);
                }, children: [_jsx("p", { className: "font-bold text-light-gold", children: complete ? `النتيجة الموزونة: ${total.toFixed(2)}/100` : 'النتيجة غير مكتملة — بانتظار درجات جميع الأعضاء النشطين' }), !admin && (_jsxs("label", { className: "block max-w-xs space-y-2 text-sm text-text", children: [_jsx("span", { children: "\u062F\u0631\u062C\u062A\u0643 \u0644\u0644\u0645\u062A\u0642\u062F\u0645 \u0645\u0646 100" }), _jsx("input", { "aria-label": "\u062F\u0631\u062C\u062A\u0643 \u0644\u0644\u0645\u062A\u0642\u062F\u0645 \u0645\u0646 100", required: true, type: "number", min: "0", max: "100", step: "0.01", className: input, value: value, onChange: (event) => setValue(event.target.value) })] })), mine && !admin && _jsxs("p", { className: "text-sm text-ok", children: ["\u062F\u0631\u062C\u062A\u0643 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629: ", mine.percent, "/100"] }), _jsxs("label", { className: "block space-y-2 text-sm text-text", children: [_jsx("span", { children: "\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0644\u062C\u0646\u0629" }), _jsx("textarea", { className: input, rows: 3, maxLength: 1000, value: note, onChange: (event) => setNote(event.target.value), placeholder: "\u0645\u0644\u0627\u062D\u0638\u0629 \u0645\u0639 \u0627\u0644\u062F\u0631\u062C\u0629\u060C \u0625\u0646 \u0648\u062C\u062F\u062A" })] }), allowSalary && (_jsxs("label", { className: "block max-w-xs space-y-2 text-sm text-text", children: [_jsx("span", { children: "\u0627\u0644\u0631\u0627\u062A\u0628 \u0627\u0644\u0645\u0642\u062F\u0631" }), _jsx("input", { className: input, inputMode: "numeric", value: salary, onChange: (event) => setSalary(event.target.value), placeholder: "\u0627\u062E\u062A\u064A\u0627\u0631\u064A" })] })), _jsx("button", { className: button, type: "submit", disabled: busy || (admin ? !complete : value === ''), children: busy ? 'جاري الاعتماد…' : admin ? 'اعتماد النتيجة النهائية' : 'حفظ الدرجة واعتماد النتيجة' })] }))), manage && !final && _jsx("p", { className: "text-xs text-mute", children: allowSalary ? 'يُحفظ تقييمك وتُعتمد النتيجة معاً، مع الملاحظة والراتب المقدر، دون البحث عن المتقدم مرة أخرى.' : 'يُحفظ تقييمك وتُعتمد النتيجة معاً في هذه الخطوة، ويبقى اسم المتقدم محدداً إذا تعذّر الاعتماد.' }), error && (_jsx("p", { role: "alert", className: "text-error", children: error }))] }));
}
