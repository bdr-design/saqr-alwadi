package com.bdr.saqralwadi;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;

/**
 * The page's window.SaqrApp: what the game's settings ask of the system (its About card, src/game/08-ui.js): the
 * store's page to rate the game, the share sheet, a mail to the developer, and leaving the app once the player has
 * said so (the system's back at the menu's home is asked first, in the game).
 */
final class App {
    private final Activity activity;

    App(Activity activity) {
        this.activity = activity;
    }

    private void start(Intent intent) {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(intent);
            } catch (ActivityNotFoundException | SecurityException e) {
                // nothing on the phone to take it: left as it is
            }
        });
    }

    /** The game's page in the store (the Play app; without it, the browser). */
    @JavascriptInterface
    public void rate() {
        final String id = activity.getPackageName();
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id)));
            } catch (ActivityNotFoundException | SecurityException e) {
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + id)));
                } catch (ActivityNotFoundException | SecurityException e2) {
                    // no store and no browser
                }
            }
        });
    }

    /** The system's share sheet with the game's line and its link. */
    @JavascriptInterface
    public void share(String text) {
        if (text == null || text.length() > 600) return;
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        start(Intent.createChooser(send, null));
    }

    /** A mail to the developer in the phone's mail app. */
    @JavascriptInterface
    public void mail(String to, String subject) {
        if (to == null || !to.matches("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")) return;
        Intent mail = new Intent(Intent.ACTION_SENDTO, Uri.fromParts("mailto", to, null));
        if (subject != null && subject.length() <= 80) mail.putExtra(Intent.EXTRA_SUBJECT, subject);
        start(mail);
    }

    /** Leaving: the app to the background, the game kept as it is (as the system's back did before it was asked). */
    @JavascriptInterface
    public void exit() {
        activity.runOnUiThread(() -> activity.moveTaskToBack(true));
    }
}
