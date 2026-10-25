import AVFoundation
import UIKit
import WebKit

/// Serves the game's files from the app bundle under one origin (saqr://game/...). Loading them as file:// URLs would
/// make every map tile a cross-origin image, which WebGL refuses as a texture.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        let path = url.path.isEmpty || url.path == "/" ? "index.html" : String(url.path.dropFirst())
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let headers = ["Content-Type": Self.mime(file.pathExtension), "Content-Length": String(data.count)]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "json": return "application/json"
        default: return "application/octet-stream"
        }
    }
}

/// The whole app: the game, edge to edge, landscape, nothing of the system in the way.
final class GameViewController: UIViewController {
    private var web: WKWebView!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(root: Bundle.main.url(forResource: "web", withExtension: nil)!), forURLScheme: "saqr")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: URL(string: "saqr://game/index.html")!))
        // Back from the home screen or a call: iOS has interrupted the audio. Reactivate the session and let the game
        // try to resume; its first touch after that rebuilds the sound if WebKit left it silent.
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(wakeAudio), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    }

    @objc private func wakeAudio() {
        try? AVAudioSession.sharedInstance().setActive(true)
        web.evaluateJavaScript("window.__audioWake && window.__audioWake()")
    }

    @objc private func audioInterrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
        wakeAudio()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    // a drag from the screen's edge looks around the cockpit; the system's edge gestures wait for a second swipe
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}
