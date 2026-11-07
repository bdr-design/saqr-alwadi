package com.bdr.saqralwadi;

import android.app.Activity;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;

/**
 * The page's window.SaqrMedia: the screen kept on while a mission is flown (awake), let go in the menu, the end card
 * and a pause (it had stayed on in the menu too, the phone never sleeping).
 */
final class Media {
    private final Activity activity;

    Media(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void awake(boolean on) {
        activity.runOnUiThread(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
}
