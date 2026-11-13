import AppKit
import BandDeskBridgeCore
import Foundation

@MainActor
final class BridgeViewModel: ObservableObject {
    @Published private(set) var snapshot: CodexSnapshot?
    @Published private(set) var isRefreshing = false
    @Published private(set) var codexStatus = "等待首次读取"
    @Published private(set) var bridgeStatus = "正在启动"
    @Published private(set) var astroBoxStatus = "等待插件"
    @Published private(set) var bandStatus = "等待手环确认"
    @Published private(set) var errorMessage: String?

    private let store: SnapshotStore
    private let client = CodexAppServerClient()
    private let sessionID = UUID().uuidString
    private let sourceID: String
    private var revision: Int64
    private var server: BridgeHTTPServer?
    private var started = false

    init() {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: "sourceID") {
            sourceID = existing
        } else {
            let created = UUID().uuidString
            defaults.set(created, forKey: "sourceID")
            sourceID = created
        }
        revision = max(0, (defaults.object(forKey: "revision") as? NSNumber)?.int64Value ?? 0)
        let cached = defaults.data(forKey: "lastSnapshot").flatMap { try? JSONDecoder().decode(CodexSnapshot.self, from: $0) }
        snapshot = cached
        store = SnapshotStore(cached)
        if cached != nil { codexStatus = "已载入本地缓存" }
        if let saved = defaults.string(forKey: "lastAstroStatusText") { astroBoxStatus = "上次·\(saved)" }
        if let saved = defaults.string(forKey: "lastBandStatusText") { bandStatus = "上次·\(saved)" }
        server = BridgeHTTPServer(
            store: store,
            onState: { [weak self] state in Task { @MainActor in self?.bridgeStatus = state } },
            onEvent: { [weak self] data in Task { @MainActor in self?.handleEvent(data) } }
        )
    }

    func start() {
        guard !started else { return }
        started = true
        do { try server?.start() }
        catch { bridgeStatus = "失败"; errorMessage = "本机桥启动失败：\(error.localizedDescription)" }
        refresh()
        Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 120 * 1_000_000_000)
                guard let self else { return }
                self.refresh()
            }
        }
    }

    func refresh() {
        guard !isRefreshing else { return }
        isRefreshing = true
        errorMessage = nil
        codexStatus = "正在读取"
        let client = client, sourceID = sourceID, sessionID = sessionID, nextRevision = revision + 1
        Task {
            do {
                let fresh = try await Task.detached {
                    try client.fetchSnapshot(sourceID: sourceID, sessionID: sessionID, revision: nextRevision)
                }.value
                revision = nextRevision
                UserDefaults.standard.set(revision, forKey: "revision")
                if let data = try? JSONEncoder().encode(fresh) { UserDefaults.standard.set(data, forKey: "lastSnapshot") }
                snapshot = fresh
                store.update(fresh)
                codexStatus = "正常 · \(Self.relative(fresh.fetchedAt))"
            } catch {
                codexStatus = snapshot == nil ? "读取失败" : "读取失败 · 保留缓存"
                errorMessage = error.localizedDescription
            }
            isRefreshing = false
        }
    }

    func openAstroBox() {
        let url = URL(fileURLWithPath: "/Applications/AstroBox.app")
        NSWorkspace.shared.openApplication(at: url, configuration: .init()) { [weak self] _, error in
            if let error { Task { @MainActor in self?.errorMessage = "无法打开 AstroBox：\(error.localizedDescription)" } }
        }
    }

    private func handleEvent(_ data: Data) {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if object["kind"] as? String == "relay_status" {
            switch object["status"] as? String {
            case "sent":
                astroBoxStatus = "已转发快照"
                bandStatus = "已发送 · 等待 ACK"
                UserDefaults.standard.set(bandStatus, forKey: "lastBandStatusText")
            case "no_device": astroBoxStatus = "未发现已连接设备"
            case "mac_unreachable": astroBoxStatus = "插件无法访问本机桥"
            case "send_failed": astroBoxStatus = "向手环发送失败"
            default: astroBoxStatus = "插件已响应"
            }
            UserDefaults.standard.set(astroBoxStatus, forKey: "lastAstroStatusText")
        }
        switch object["type"] as? String {
        case "ack":
            let revision = (object["revision"] as? NSNumber)?.int64Value ?? 0
            bandStatus = "已确认 revision \(revision)"
            UserDefaults.standard.set(bandStatus, forKey: "lastBandStatusText")
        case "refresh_request":
            bandStatus = "手环请求刷新"
            UserDefaults.standard.set(bandStatus, forKey: "lastBandStatusText")
            refresh()
        default: break
        }
    }

    static func relative(_ milliseconds: Int64) -> String {
        let seconds = max(0, Int(Date().timeIntervalSince1970 - Double(milliseconds) / 1_000))
        if seconds < 60 { return "刚刚" }
        return "\(seconds / 60) 分钟前"
    }
}
