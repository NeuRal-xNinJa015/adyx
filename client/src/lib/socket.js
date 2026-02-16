/**
 * WebSocket client with auto-reconnect
 */

const SERVER_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

let ws = null;
let listeners = {};
let reconnectTimer = null;
let params = {};

export function connect(roomKey, role, nickname, onMessage) {
    params = { roomKey, role, nickname };
    listeners.onMessage = onMessage;
    _connect();
}

function _connect() {
    if (ws && ws.readyState <= 1) return;

    const url = `${SERVER_URL}?key=${params.roomKey}&role=${params.role}&nickname=${encodeURIComponent(params.nickname || 'Anon')}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
        console.log('[WS] Connected');
        listeners.onMessage?.({ type: 'status', status: 'connected' });
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            listeners.onMessage?.(msg);
        } catch (err) {
            console.error('[WS] Parse error:', err);
        }
    };

    ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code);
        listeners.onMessage?.({ type: 'status', status: 'disconnected' });

        if (event.code !== 4000 && event.code !== 4001 && event.code !== 4002) {
            reconnectTimer = setTimeout(_connect, 3000);
        }
    };

    ws.onerror = () => {
        listeners.onMessage?.({ type: 'status', status: 'error' });
    };
}

export function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

export function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close(1000, 'User disconnect');
    ws = null;
}
