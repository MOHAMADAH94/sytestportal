/**
 * توليد معرف فريد UUID v4 آمن ومتوافق مع جميع المتصفحات والبيئات،
 * بما فيها شبكات LAN وعناوين HTTP (غير الآمنة non-secure contexts)
 * حيث لا تتوفر دالة window.crypto.randomUUID الأصلية.
 */
export function safeRandomUUID() {
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
        try {
            return window.crypto.randomUUID();
        }
        catch {
            // fallback in case randomUUID throws in restricted sandboxes
        }
    }
    if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
        try {
            const bytes = new Uint8Array(16);
            window.crypto.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
            bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
            const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
        catch {
            // fallback to Math.random
        }
    }
    // Fallback for non-secure HTTP environments on mobile browsers
    let d = Date.now();
    let d2 = (typeof performance !== 'undefined' && performance.now && performance.now() * 1000) || 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        let r = Math.random() * 16;
        if (d > 0) {
            r = (d + r) % 16 | 0;
            d = Math.floor(d / 16);
        }
        else if (d2 > 0) {
            r = (d2 + r) % 16 | 0;
            d2 = Math.floor(d2 / 16);
        }
        else {
            r = (Math.random() * 16) | 0;
        }
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}
