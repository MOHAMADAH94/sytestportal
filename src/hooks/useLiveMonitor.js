import { safeRandomUUID } from '../utils/uuid';
import { useCallback, useEffect, useRef, useState } from 'react';
export const MONITOR_LABELS = {
    connected: 'اتصال الجلسة', disconnected: 'انقطاع الاتصال', page_hidden: 'وضع الصفحة في الخلفية',
    page_visible: 'العودة للصفحة', window_blur: 'فقدان التركيز', window_focus: 'استعادة التركيز',
    page_reload: 'إعادة تحميل الصفحة', page_leave: 'مغادرة الصفحة', navigation_attempt: 'محاولة التنقل',
    fullscreen_exit: 'مغادرة ملء الشاشة', screen_started: 'بدء مشاركة الشاشة', screen_stopped: 'فقدان مشاركة الشاشة',
    screen_denied: 'لم تُمنح مشاركة الشاشة', screen_unavailable: 'مشاركة الشاشة غير متاحة', returned: 'العودة إلى الاختبار', session_ended: 'انتهاء الجلسة',
};
export const MONITOR_STATUS = { unavailable: 'جزئية — مشاركة الشاشة غير متاحة', denied: 'جزئية — لم تُمنح المشاركة', partial: 'مراقبة جزئية', screen: 'مشاركة شاشة كاملة', stopped: 'مشاركة متوقفة', pending: 'لم تبدأ المشاركة' };
function wsUrl(token) {
    const qs = token ? '?token=' + encodeURIComponent(token) : '';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws' + qs;
}
export function useExamineeLiveStream(opts) {
    const [screenSharing, setScreenSharing] = useState(false);
    const [monitoringStatus, setMonitoringStatus] = useState('pending');
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    const streamRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const generation = useRef(0), queue = useRef([]), reloadReported = useRef(false);
    const captureSurface = useRef('unknown');
    const state = useRef(opts), statusRef = useRef(monitoringStatus);
    state.current = opts;
    statusRef.current = monitoringStatus;
    const send = useCallback((payload) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 1000000) {
            ws.send(JSON.stringify(payload));
            return true;
        }
        return false;
    }, []);
    const reportEvent = useCallback((kind, durationMs) => {
        const payload = { type: 'live:event', kind, durationMs, eventId: safeRandomUUID() };
        if (!send(payload)) {
            queue.current.push(payload);
            if (queue.current.length > 200)
                queue.current.shift();
        }
    }, [send]);
    const stopCapture = useCallback(() => {
        generation.current++;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current)
            videoRef.current.srcObject = null;
        setScreenSharing(false);
        setMonitoringStatus('stopped');
    }, []);
    const startCapture = useCallback(async () => {
        const current = ++generation.current;
        if (!window.isSecureContext || typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
            setMonitoringStatus('unavailable');
            reportEvent('screen_unavailable');
            return false;
        }
        let stream = null;
        try {
            streamRef.current?.getTracks().forEach((track) => track.stop());
            stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 3 }, audio: false });
            if (generation.current !== current) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }
            const track = stream.getVideoTracks()[0];
            captureSurface.current = track?.getSettings().displaySurface || 'unknown';
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;
            await video.play();
            if (generation.current !== current) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }
            videoRef.current = video;
            streamRef.current = stream;
            setScreenSharing(true);
            setMonitoringStatus(captureSurface.current === 'monitor' ? 'screen' : 'partial');
            reportEvent('screen_started');
            track.addEventListener('ended', () => {
                if (streamRef.current !== stream)
                    return;
                streamRef.current = null;
                video.srcObject = null;
                setScreenSharing(false);
                setMonitoringStatus('stopped');
                reportEvent('screen_stopped');
                state.current.onError?.('توقفت مشاركة الشاشة. تظهر هذه الحالة للمسؤول ويمكنك إعادة المشاركة.');
            });
            return true;
        }
        catch {
            stream?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
            setScreenSharing(false);
            setMonitoringStatus('denied');
            reportEvent('screen_denied');
            state.current.onError?.('لم تبدأ مشاركة الشاشة. ستظهر المراقبة جزئية للمسؤول.');
            return false;
        }
    }, [reportEvent]);
    useEffect(() => {
        if (!opts.enabled || !opts.token)
            return;
        let closed = false, reconnect;
        function snapshot() {
            const s = state.current;
            return { questionIndex: s.questionIndex, questionTotal: s.questionTotal, secondsLeft: s.secondsLeft, screenSharing: !!streamRef.current, monitoringStatus: statusRef.current, captureSurface: captureSurface.current };
        }
        function connect() {
            if (closed)
                return;
            const ws = new WebSocket(wsUrl(state.current.token));
            wsRef.current = ws;
            let authFailCount = 0;
            ws.onopen = () => {
                authFailCount = 0;
                setConnected(true);
                send({ type: 'live:state', ...snapshot() });
                for (const item of queue.current.splice(0))
                    if (!send(item))
                        queue.current.push(item);
                if (!reloadReported.current && performance.getEntriesByType('navigation')[0]?.type === 'reload') {
                    reportEvent('page_reload');
                    reloadReported.current = true;
                }
            };
            ws.onmessage = (event) => {
                try {
                    if (JSON.parse(String(event.data)).type === 'live:stop') {
                        closed = true;
                        stopCapture();
                        state.current.onSessionEnded?.();
                    }
                }
                catch { /* invalid message */ }
            };
            ws.onclose = (event) => {
                if (wsRef.current === ws)
                    wsRef.current = null;
                setConnected(false);
                if (event.code === 4000 || event.code === 4004) {
                    closed = true;
                    stopCapture();
                    state.current.onSessionEnded?.();
                }
                else if ([4002, 4003].includes(event.code)) {
                    authFailCount++;
                    if (authFailCount >= 5) {
                        closed = true;
                        stopCapture();
                        state.current.onError?.('تنبيه: تعمل المراقبة في الوضع المخفف على هذا المتصفح.');
                    }
                }
                if (!closed)
                    reconnect = window.setTimeout(connect, 3000);
            };
        }
        connect();
        const heartbeat = window.setInterval(() => send({ type: 'live:heartbeat', ...snapshot() }), 4000);
        canvasRef.current = document.createElement('canvas');
        const frameTimer = window.setInterval(() => {
            const video = videoRef.current, canvas = canvasRef.current;
            if (!streamRef.current || !video || !canvas || video.videoWidth < 2 || video.videoHeight < 2)
                return;
            const ratio = Math.min(1, 480 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * ratio);
            canvas.height = Math.round(video.videoHeight * ratio);
            try {
                canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
                send({ type: 'live:frame', frame: canvas.toDataURL('image/jpeg', 0.5), ...snapshot() });
            }
            catch { /* transient video frame */ }
        }, 3000);
        const away = new Map();
        const leave = (kind) => { if (!away.has(kind)) {
            away.set(kind, Date.now());
            reportEvent(kind);
        } };
        const returned = (kind, back) => { const time = away.get(kind); if (time != null) {
            away.delete(kind);
            reportEvent(back, Date.now() - time);
            reportEvent('returned', Date.now() - time);
        } };
        const visibility = () => document.hidden ? leave('page_hidden') : returned('page_hidden', 'page_visible');
        const blur = () => leave('window_blur'), focus = () => returned('window_blur', 'window_focus');
        let full = !!document.fullscreenElement;
        const fullscreen = () => { if (full && !document.fullscreenElement)
            reportEvent('fullscreen_exit'); full = !!document.fullscreenElement; };
        const pageLeave = () => reportEvent('page_leave'), navigation = () => reportEvent('navigation_attempt');
        document.addEventListener('visibilitychange', visibility);
        document.addEventListener('fullscreenchange', fullscreen);
        window.addEventListener('blur', blur);
        window.addEventListener('focus', focus);
        window.addEventListener('pagehide', pageLeave);
        window.addEventListener('popstate', navigation);
        return () => {
            closed = true;
            clearInterval(heartbeat);
            clearInterval(frameTimer);
            if (reconnect)
                clearTimeout(reconnect);
            document.removeEventListener('visibilitychange', visibility);
            document.removeEventListener('fullscreenchange', fullscreen);
            window.removeEventListener('blur', blur);
            window.removeEventListener('focus', focus);
            window.removeEventListener('pagehide', pageLeave);
            window.removeEventListener('popstate', navigation);
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [opts.enabled, opts.token, send, stopCapture, reportEvent]);
    useEffect(() => () => { stopCapture(); }, [stopCapture]);
    return { screenSharing, monitoringStatus, connected, startCapture, stopCapture, send, reportEvent };
}
export function useAdminLiveMonitor(token, selectedSessionId) {
    const [sessions, setSessions] = useState([]);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef(null);
    useEffect(() => {
        if (!token)
            return;
        let closed = false;
        let reconnectTimer;
        function connect() {
            if (closed)
                return;
            const ws = new WebSocket(wsUrl(token));
            wsRef.current = ws;
            ws.onopen = () => {
                setConnected(true);
                if (selectedSessionId)
                    ws.send(JSON.stringify({ type: 'live:subscribe', sessionId: selectedSessionId }));
            };
            ws.onclose = () => {
                setConnected(false);
                wsRef.current = null;
                if (!closed)
                    reconnectTimer = window.setTimeout(connect, 2000);
            };
            ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(String(ev.data));
                    if (msg.type === 'live:snapshot' && Array.isArray(msg.sessions)) {
                        setSessions(msg.sessions);
                    }
                    if (msg.type === 'live:update' && msg.session) {
                        setSessions((prev) => {
                            const i = prev.findIndex((s) => s.sessionId === msg.session.sessionId);
                            if (i === -1)
                                return [msg.session, ...prev];
                            const next = [...prev];
                            next[i] = { ...next[i], ...msg.session };
                            return next;
                        });
                    }
                    if (msg.type === 'live:ended' && msg.sessionId) {
                        setSessions((prev) => prev.filter((s) => s.sessionId !== msg.sessionId));
                    }
                }
                catch {
                    /* */
                }
            };
        }
        connect();
        return () => {
            closed = true;
            if (reconnectTimer)
                window.clearTimeout(reconnectTimer);
            wsRef.current?.close();
        };
    }, [token, selectedSessionId]);
    return { sessions, connected };
}
