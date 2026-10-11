import { useEffect } from 'react';
function isEditableTarget(target) {
    if (!(target instanceof HTMLElement))
        return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
/** يمنع النسخ والقص والقائمة السياقية ويُضعف لقطات الشاشة قدر الإمكان في المتصفح */
export function useExamAntiCheat(enabled) {
    useEffect(() => {
        if (!enabled)
            return;
        const blockUnlessEditable = (e) => {
            if (isEditableTarget(e.target))
                return;
            e.preventDefault();
            return false;
        };
        const blockAlways = (e) => {
            e.preventDefault();
            return false;
        };
        const onKeyDown = (e) => {
            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;
            const editable = isEditableTarget(e.target);
            if (key === 'printscreen' ||
                e.key === 'F12' ||
                (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(key))) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            if (ctrl && ['s', 'p', 'u'].includes(key)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            if (ctrl && ['c', 'x'].includes(key) && !editable) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            if (ctrl && key === 'a' && !editable) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        };
        const onVisibility = () => {
            document.documentElement.classList.toggle('exam-blur-secure', document.hidden);
        };
        document.addEventListener('copy', blockAlways, true);
        document.addEventListener('cut', blockAlways, true);
        document.addEventListener('contextmenu', blockAlways, true);
        document.addEventListener('dragstart', blockUnlessEditable, true);
        document.addEventListener('selectstart', blockUnlessEditable, true);
        window.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('visibilitychange', onVisibility);
        document.documentElement.classList.add('exam-secure');
        return () => {
            document.removeEventListener('copy', blockAlways, true);
            document.removeEventListener('cut', blockAlways, true);
            document.removeEventListener('contextmenu', blockAlways, true);
            document.removeEventListener('dragstart', blockUnlessEditable, true);
            document.removeEventListener('selectstart', blockUnlessEditable, true);
            window.removeEventListener('keydown', onKeyDown, true);
            document.removeEventListener('visibilitychange', onVisibility);
            document.documentElement.classList.remove('exam-secure', 'exam-blur-secure');
        };
    }, [enabled]);
}
