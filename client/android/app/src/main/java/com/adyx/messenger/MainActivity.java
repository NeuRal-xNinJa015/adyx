package com.adyx.messenger;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ══════════════════════════════════════════════
        // FLAG_SECURE — OS-level screenshot & screen recording prevention
        // 
        // This blocks:
        //   • Screenshots (shows blank/black)
        //   • Screen recording (black frames)
        //   • App preview in recent apps (blank thumbnail)
        //   • Screen sharing of this window
        //
        // This CANNOT be bypassed by the user.
        // ══════════════════════════════════════════════
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }
}
