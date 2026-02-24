/**
 * AegisComms WebSocket Connection Manager
 * 
 * Manages the WebSocket connection to the Erlang router.
 * Handles authentication, reconnection, and message dispatch.
 */

export class AegisWebSocket {
    constructor(url, deviceId) {
        this.url = url;
        this.deviceId = deviceId;
        this.ws = null;
        this.authenticated = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        this.handlers = {};
    }

    /**
     * Register a handler for a message type
     */
    on(type, handler) {
        if (!this.handlers[type]) {
            this.handlers[type] = [];
        }
        this.handlers[type].push(handler);
        return this;
    }

    /**
     * Emit to registered handlers
     */
    emit(type, data) {
        const handlers = this.handlers[type] || [];
        handlers.forEach(h => h(data));
    }

    /**
     * Connect to the WebSocket server
     */
    connect() {
        return new Promise((resolve, reject) => {
            console.log(`[WS] Connecting to ${this.url}...`);
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WS] Connected');
                this.reconnectAttempts = 0;
                this.authenticate();
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    this.handleMessage(msg);
                } catch (err) {
                    console.error('[WS] Failed to parse message:', err);
                }
            };

            this.ws.onclose = (event) => {
                console.log(`[WS] Disconnected (code: ${event.code})`);
                this.authenticated = false;
                this.emit('disconnected', event);
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('[WS] Error:', error);
                this.emit('error', error);
                reject(error);
            };
        });
    }

    /**
     * Authenticate with the router
     */
    authenticate() {
        this.send({
            type: 'auth',
            deviceId: this.deviceId,
            token: 'dev-token', // TODO: Use certificate-based auth
        });
    }

    /**
     * Handle incoming messages
     */
    handleMessage(msg) {
        switch (msg.type) {
            case 'auth_ok':
                console.log('[WS] Authenticated as', msg.deviceId);
                this.authenticated = true;
                this.emit('authenticated', msg);
                break;

            case 'message':
                console.log('[WS] Message received from', msg.from);
                this.emit('message', msg);
                break;

            case 'ack':
                this.emit('ack', msg);
                break;

            case 'presence':
                this.emit('presence', msg);
                break;

            case 'error':
                console.error('[WS] Server error:', msg.message);
                this.emit('error', msg);
                break;

            default:
                console.log('[WS] Unknown message type:', msg.type);
        }
    }

    /**
     * Send an encrypted message to a recipient
     */
    sendMessage(recipientDeviceId, encryptedPayload) {
        if (!this.authenticated) {
            throw new Error('Not authenticated');
        }
        this.send({
            type: 'message',
            to: recipientDeviceId,
            payload: encryptedPayload, // base64 encoded encrypted blob
        });
    }

    /**
     * Update presence status
     */
    setPresence(status) {
        this.send({
            type: 'presence',
            status: status, // 'online', 'away', 'stealth'
        });
    }

    /**
     * Send a JSON message over the WebSocket
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('[WS] Cannot send — not connected');
        }
    }

    /**
     * Auto-reconnect with exponential backoff
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[WS] Max reconnect attempts reached');
            this.emit('reconnect_failed', null);
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect().catch(() => { });
        }, delay);
    }

    /**
     * Disconnect cleanly
     */
    disconnect() {
        if (this.ws) {
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
    }
}
