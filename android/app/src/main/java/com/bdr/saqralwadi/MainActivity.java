package com.bdr.saqralwadi;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * The whole app: the game, edge to edge, landscape, nothing of the system in the way (the Android twin of
 * ios/SaqrAlwadi/GameViewController.swift).
 *
 * The game's files are served from the app's assets under one https origin (WebViewAssetLoader): loaded as file://
 * URLs every map tile would be a cross-origin image, which WebGL refuses as a texture, and the page's storage would
 * have no origin to keep it under.
 */
public final class MainActivity extends Activity {
    private static final String START = "https://" + WebViewAssetLoader.DEFAULT_DOMAIN + "/web/index.html";
    private WebView web;
    private PowerManager.OnThermalStatusChangedListener heatListener;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // the screen stays on through a mission; no title, no bars
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                  // the choices kept: the map, the aircraft, the language, the scores
        s.setMediaPlaybackRequiresUserGesture(false);  // the radio and the rotor without a touch first
        s.setTextZoom(100);                            // the phone's own text size does not move the game's layout
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                tellHeat();
            }
        });
        setContentView(web);
        hideBars();
        // running hot, the game eases off (30 frames a second; at critical, fewer pixels) until the phone cools
        if (Build.VERSION.SDK_INT >= 29) {
            heatListener = status -> tellHeat();
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null) pm.addThermalStatusListener(getMainExecutor(), heatListener);
        }
        web.loadUrl(START);
    }

    // Android's thermal status (none, light, moderate, severe and worse) as the game knows it from iOS: 0 nominal,
    // 1 fair, 2 serious, 3 critical
    private void tellHeat() {
        if (Build.VERSION.SDK_INT < 29 || web == null) return;
        PowerManager pm = getSystemService(PowerManager.class);
        if (pm == null) return;
        int level = Math.min(3, pm.getCurrentThermalStatus());
        web.evaluateJavascript("window.__thermal && window.__thermal(" + level + ")", null);
    }

    private void hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    // Leaving: the game suspends its sound. Back: a moment for the audio to come up, then the game builds its sound
    // afresh (window.__audioSleep and __audioWake, as the iOS app calls them)
    @Override
    protected void onPause() {
        if (web != null) {
            web.evaluateJavascript("window.__audioSleep && window.__audioSleep()", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web == null) return;
        web.onResume();
        hideBars();
        web.postDelayed(() -> {
            if (web != null) web.evaluateJavascript("window.__audioWake && window.__audioWake()", null);
            tellHeat();
        }, 250);
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 29 && heatListener != null) {
            PowerManager pm = getSystemService(PowerManager.class);
            if (pm != null) pm.removeThermalStatusListener(heatListener);
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
