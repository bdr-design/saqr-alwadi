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
        case "mp3": return "audio/mpeg"
        default: return "application/octet-stream"
        }
    }
}

/// The radio's voices: the device's Arabic voice rendered to samples instead of played, so the game can put them
/// through the radio set. From the page: `await webkit.messageHandlers.voice.postMessage({ text, voice, rate, pitch })`
/// gives `{ sr, pcm }`, pcm being base64 of mono Float32 samples. `voice` picks among the Arabic voices, best first.
final class VoiceRenderer: NSObject, WKScriptMessageHandlerWithReply {
    /// One line being rendered: its synthesizer (it must live until its last buffer), the samples so far, the reply.
    private final class Job {
        let synth = AVSpeechSynthesizer()
        let reply: (Any?, String?) -> Void
        var samples: [Float] = []
        var rate = 22050.0
        var done = false
        var idle: DispatchWorkItem?
        init(reply: @escaping (Any?, String?) -> Void) { self.reply = reply }
    }

    private var jobs: [ObjectIdentifier: Job] = [:]
    private lazy var voices: [AVSpeechSynthesisVoice] = AVSpeechSynthesisVoice.speechVoices()
        .filter { $0.language.hasPrefix("ar") }
        .sorted { ($0.quality.rawValue, $0.identifier) > ($1.quality.rawValue, $1.identifier) }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let text = body["text"] as? String, !voices.isEmpty else {
            replyHandler(nil, "no Arabic voice")
            return
        }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voices[((body["voice"] as? Int) ?? 0) % voices.count]
        utterance.rate = Float((body["rate"] as? Double) ?? Double(AVSpeechUtteranceDefaultSpeechRate))
        utterance.pitchMultiplier = Float((body["pitch"] as? Double) ?? 1)
        let job = Job(reply: replyHandler)
        job.synth.usesApplicationAudioSession = false   // rendering only: leave the game's audio session alone
        jobs[ObjectIdentifier(job)] = job
        idle(job, after: 8)
        job.synth.write(utterance) { [weak self] buffer in
            guard let pcm = buffer as? AVAudioPCMBuffer else { return }
            let chunk = VoiceRenderer.samples(of: pcm), sr = pcm.format.sampleRate
            DispatchQueue.main.async {
                guard let self = self, !job.done else { return }
                if chunk.count <= 1 { self.finish(job); return }   // the last buffer comes empty
                job.rate = sr
                job.samples.append(contentsOf: chunk)
                self.idle(job, after: 0.8)
            }
        }
    }

    // a voice that never sends its empty buffer is taken as done once it goes quiet
    private func idle(_ job: Job, after seconds: Double) {
        job.idle?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.finish(job) }
        job.idle = item
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    }

    private func finish(_ job: Job) {
        guard !job.done else { return }
        job.done = true
        job.idle?.cancel()
        jobs[ObjectIdentifier(job)] = nil
        if job.samples.isEmpty { job.reply(nil, "no samples"); return }
        let data = job.samples.withUnsafeBufferPointer { Data(buffer: $0) }
        job.reply(["sr": job.rate, "pcm": data.base64EncodedString()], nil)
    }

    private static func samples(of pcm: AVAudioPCMBuffer) -> [Float] {
        let n = Int(pcm.frameLength)
        if let f = pcm.floatChannelData { return Array(UnsafeBufferPointer(start: f[0], count: n)) }
        if let s = pcm.int16ChannelData { return (0..<n).map { Float(s[0][$0]) / 32768 } }
        if let s = pcm.int32ChannelData { return (0..<n).map { Float(s[0][$0]) / 2147483648 } }
        return []
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
        config.userContentController.addScriptMessageHandler(VoiceRenderer(), contentWorld: .page, name: "voice")
        // the phone's heat when the page starts (later changes come by thermalChanged)
        let heat = ProcessInfo.processInfo.thermalState.rawValue
        config.userContentController.addUserScript(WKUserScript(source: "window.__thermalLevel = \(heat);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
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
        // Leaving: the game suspends its sound, and WebKit's own media is suspended too (the page's script can be frozen
        // before it hears it, and its audio played on in the background). Back from the home screen or a call: iOS has
        // interrupted the audio, so the session is set up and activated again, then the game builds its sound afresh.
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(sleepAudio), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(sleepAudio), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(wakeAudio), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(audioInterrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        center.addObserver(self, selector: #selector(wakeAudio), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        // running hot, the game eases off (30 frames a second; at critical, fewer pixels) until the phone cools
        center.addObserver(self, selector: #selector(thermalChanged), name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
    }

    @objc private func thermalChanged() {
        DispatchQueue.main.async { [weak self] in
            let heat = ProcessInfo.processInfo.thermalState.rawValue
            self?.web.evaluateJavaScript("window.__thermal && window.__thermal(\(heat))")
        }
    }

    @objc private func sleepAudio() {
        web.evaluateJavaScript("window.__audioSleep && window.__audioSleep()")
        web.setAllMediaPlaybackSuspended(true)
    }

    @objc private func wakeAudio() {
        web.setAllMediaPlaybackSuspended(false)
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
        // a moment for the session to come up before the game starts a new audio context on it
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
            self?.web.evaluateJavaScript("window.__audioWake && window.__audioWake()")
        }
    }

    @objc private func audioInterrupted(_ note: Notification) {
        // the start of one needs nothing: the app resigns active for a call or Siri, and the game sees an alarm's
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended,
              UIApplication.shared.applicationState == .active else { return }
        wakeAudio()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    // a drag from the screen's edge looks around the cockpit; the system's edge gestures wait for a second swipe
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
}
