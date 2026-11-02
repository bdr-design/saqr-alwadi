package com.bdr.saqralwadi;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.media.MediaScannerConnection;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;

/**
 * The observer camera's clips (the iPad's OBS tab) to the phone: saved to the gallery (Movies/SaqrAlwadi), or shared
 * through the system's share (the same file, saved first: no file provider needed). The page sees it as
 * window.SaqrMedia: save(b64, mime, name) and share(b64, mime, name), b64 the clip's bytes. Each answers the page as
 * window.__media({type: 'saved' | 'shared' | 'perm' | 'error'}). From Android 10 the gallery needs no permission; on
 * 8 and 9 it needs the storage permission, asked for the first time (then 'perm': the player taps again).
 */
final class Media {
    private final Activity activity;
    private final WebView web;

    Media(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
    }

    @JavascriptInterface
    public void save(String b64, String mime, String name) { run(b64, mime, name, false); }

    @JavascriptInterface
    public void share(String b64, String mime, String name) { run(b64, mime, name, true); }

    // the screen kept on while a mission is flown, let go in the menu, the end card and a pause (it had stayed on in
    // the menu too, the phone never sleeping)
    @JavascriptInterface
    public void awake(boolean on) {
        activity.runOnUiThread(() -> {
            if (on) activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private void run(String b64, String mime, String name, boolean share) {
        if (Build.VERSION.SDK_INT < 29 && activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            activity.runOnUiThread(() -> activity.requestPermissions(new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE }, 41));
            answer("perm");
            return;
        }
        new Thread(() -> {
            try {
                Uri uri = store(Base64.decode(b64, Base64.DEFAULT), mime, name);
                if (share) {
                    Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    activity.runOnUiThread(() -> activity.startActivity(Intent.createChooser(send, null)));
                    answer("shared");
                } else answer("saved");
            } catch (Exception e) {
                answer("error");
            }
        }).start();
    }

    // into the shared Movies, in its own folder: pending while it is written (Android 10 on), then shown
    private Uri store(byte[] data, String mime, String name) throws IOException {
        ContentResolver r = activity.getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Video.Media.DISPLAY_NAME, name);
        v.put(MediaStore.Video.Media.MIME_TYPE, mime);
        Uri col;
        String legacy = null;
        if (Build.VERSION.SDK_INT >= 29) {
            v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/SaqrAlwadi");
            v.put(MediaStore.Video.Media.IS_PENDING, 1);
            col = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "SaqrAlwadi");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("no folder");
            legacy = new File(dir, name).getAbsolutePath();
            v.put(MediaStore.Video.Media.DATA, legacy);
            col = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        }
        Uri u = r.insert(col, v);
        if (u == null) throw new IOException("not inserted");
        try (OutputStream o = r.openOutputStream(u)) {
            if (o == null) throw new IOException("no stream");
            o.write(data);
        }
        if (Build.VERSION.SDK_INT >= 29) {
            v.clear();
            v.put(MediaStore.Video.Media.IS_PENDING, 0);
            r.update(u, v, null, null);
        } else {
            // (Android 8-9: the file read again so the gallery has its length and its first picture)
            MediaScannerConnection.scanFile(activity, new String[] { legacy }, new String[] { mime }, null);
        }
        return u;
    }

    private void answer(String type) {
        String js;
        try { js = "window.__media && window.__media(" + new JSONObject().put("type", type) + ")"; } catch (Exception e) { return; }
        web.post(() -> web.evaluateJavascript(js, null));
    }
}
