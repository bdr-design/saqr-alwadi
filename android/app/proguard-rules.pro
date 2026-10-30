# R8/ProGuard for the release AAB. It renames and shrinks the app's Java so the bundle is smaller and hard to read.
# Build-time only, no runtime cost. Ordinary Android code shrinking (Google ships and recommends it); it hides nothing
# from Play review.

# The JavaScript bridge: the page calls these by their method names (web.addJavascriptInterface(store, "SaqrStore") in
# MainActivity, and @JavascriptInterface methods in Store.java). Keep every @JavascriptInterface method's name.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# The WebView may call back into named members; keep JavaScript-facing interface classes intact.
-keep class com.bdr.saqralwadi.Store { *; }

# Keep the source file/line tables useful for crash reports in Play Console (map file is uploaded separately).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Google Play Billing ships its own consumer rules; keep its listeners for safety.
-keep class com.android.billingclient.** { *; }
-dontwarn com.android.billingclient.**
