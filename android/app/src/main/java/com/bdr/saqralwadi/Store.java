package com.bdr.saqralwadi;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The game's purchases through Google Play Billing (the only way Google Play lets a game sell what is played: an
 * aircraft, a campaign, missions). One-time products, kept for good once bought.
 *
 * The page sees it as window.SaqrStore: start(ids) with the product ids it sells (a JSON array), buy(id), restore().
 * Everything comes back to the page as window.__store(event): {type: 'products', list: [{id, price, title}]},
 * {type: 'owned', ids: [...]} (all the player owns, on every start and after every purchase), {type: 'bought', id},
 * {type: 'cancelled'}, {type: 'error', code, message}. A purchase is acknowledged at once (unacknowledged, Google
 * refunds it after three days); one still pending (paid later, at a shop) is owned once it clears.
 */
final class Store implements PurchasesUpdatedListener {
    private final Activity activity;
    private final WebView web;
    private final BillingClient client;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private final List<String> ids = new ArrayList<>();
    private boolean ready;

    Store(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        client = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    // ---- the page's side (called on the WebView's own thread: the work goes to the main one)

    @JavascriptInterface
    public void start(String json) {
        activity.runOnUiThread(() -> {
            ids.clear();
            try {
                JSONArray a = new JSONArray(json);
                for (int i = 0; i < a.length(); i++) ids.add(a.getString(i));
            } catch (Exception e) {
                error(-1, "bad product list");
                return;
            }
            if (ids.isEmpty()) return;
            if (ready) refresh();
            else connect();
        });
    }

    @JavascriptInterface
    public void buy(String id) {
        activity.runOnUiThread(() -> {
            ProductDetails pd = details.get(id);
            if (!ready || pd == null) {
                error(-1, "product not available: " + id);
                return;
            }
            BillingFlowParams.ProductDetailsParams item = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(pd).build();
            BillingResult r = client.launchBillingFlow(activity, BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(item)).build());
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) error(r.getResponseCode(), r.getDebugMessage());
        });
    }

    @JavascriptInterface
    public void restore() {
        activity.runOnUiThread(() -> {
            if (ready) queryOwned();
            else connect();
        });
    }

    // ---- Google Play's side

    private void connect() {
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    ready = true;
                    activity.runOnUiThread(Store.this::refresh);
                } else error(r.getResponseCode(), r.getDebugMessage());
            }

            @Override
            public void onBillingServiceDisconnected() {
                ready = false;
            }
        });
    }

    private void refresh() {
        queryProducts();
        queryOwned();
    }

    private void queryProducts() {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : ids) list.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (r, result) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                error(r.getResponseCode(), r.getDebugMessage());
                return;
            }
            JSONArray out = new JSONArray();
            for (ProductDetails pd : result.getProductDetailsList()) {
                details.put(pd.getProductId(), pd);
                ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
                try {
                    out.put(new JSONObject().put("id", pd.getProductId()).put("title", pd.getName())
                            .put("price", offer != null ? offer.getFormattedPrice() : ""));
                } catch (Exception ignored) {
                }
            }
            send("products", "list", out);
        });
    }

    private void queryOwned() {
        client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (r, purchases) -> {
                    if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) take(purchases, false);
                    else error(r.getResponseCode(), r.getDebugMessage());
                });
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) take(purchases, true);
        else if (code == BillingClient.BillingResponseCode.USER_CANCELED) send("cancelled", null, null);
        else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) queryOwned();
        else error(code, r.getDebugMessage());
    }

    // the purchases made: each acknowledged, what they hold told to the page (every one the player owns, and the
    // new ones as bought)
    private void take(List<Purchase> purchases, boolean fresh) {
        JSONArray owned = new JSONArray();
        for (Purchase p : purchases) {
            if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            if (!p.isAcknowledged()) client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(p.getPurchaseToken()).build(), ack -> { });
            for (String id : p.getProducts()) {
                owned.put(id);
                if (fresh) send("bought", "id", id);
            }
        }
        if (fresh) queryOwned();
        else send("owned", "ids", owned);
    }

    private void error(int code, String message) {
        try {
            emit(new JSONObject().put("type", "error").put("code", code).put("message", message == null ? "" : message));
        } catch (Exception ignored) {
        }
    }

    private void send(String type, String key, Object value) {
        try {
            JSONObject o = new JSONObject().put("type", type);
            if (key != null) o.put(key, value);
            emit(o);
        } catch (Exception ignored) {
        }
    }

    private void emit(JSONObject event) {
        String js = "window.__store && window.__store(" + event + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    void end() {
        client.endConnection();
    }
}
