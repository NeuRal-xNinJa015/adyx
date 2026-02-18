/**
 * Mobile App Lifecycle Manager
 * 
 * Handles app backgrounding events using Capacitor's App plugin.
 * When the app goes to background (Home, Back, task switch):
 *   → All chat messages are destroyed instantly
 *   → WebSocket is disconnected
 *   → Peer is notified via room_end
 * 
 * Also handles Android back button to trigger immediate chat destruction.
 */

let appPlugin = null;
let backgroundCallback = null;
let backButtonCallback = null;
let isNative = false;

/**
 * Initialize the lifecycle manager.
 * Call this once when ChatRoom mounts.
 * @param {Function} onBackground - called immediately when app goes to background
 * @param {Function} onBackButton - called when Android back button is pressed
 */
export async function initLifecycle(onBackground, onBackButton) {
    backgroundCallback = onBackground;
    backButtonCallback = onBackButton;

    try {
        // Dynamic import — only loads on native, fails gracefully on web
        const { App } = await import('@capacitor/app');
        appPlugin = App;
        isNative = true;

        // ── App state change (Home button, task switcher, etc.) ──
        App.addListener('appStateChange', (state) => {
            if (!state.isActive && backgroundCallback) {
                // App went to background — destroy chat IMMEDIATELY
                backgroundCallback();
            }
        });

        // ── Android Back Button ──
        App.addListener('backButton', (event) => {
            // Override default back behavior — destroy chat instead
            if (backButtonCallback) {
                backButtonCallback();
            }
        });

        console.log('[LIFECYCLE] Native listeners registered');
    } catch (e) {
        // Running in web browser, not native — use web fallbacks
        isNative = false;
        console.log('[LIFECYCLE] Web mode — using visibilitychange fallback');

        // Web fallback: visibilitychange + pagehide
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && backgroundCallback) {
                backgroundCallback();
            }
        });

        window.addEventListener('pagehide', () => {
            if (backgroundCallback) {
                backgroundCallback();
            }
        });
    }
}

/**
 * Clean up all listeners. Call when ChatRoom unmounts.
 */
export async function destroyLifecycle() {
    if (appPlugin) {
        try {
            await appPlugin.removeAllListeners();
        } catch (e) {
            // ignore
        }
    }
    backgroundCallback = null;
    backButtonCallback = null;
}

/**
 * Check if running as native app
 */
export function isNativeApp() {
    return isNative;
}
