import Foundation

public enum CodexClientError: LocalizedError {
    case binaryNotFound
    case launchFailed(String)
    case timeout(String)
    case server(String)

    public var errorDescription: String? {
        switch self {
        case .binaryNotFound:
            return "未找到可运行的 Codex；请安装或启动 ChatGPT/Codex，或设置 BAND_DESK_CODEX_BIN"
        case .launchFailed(let detail): return "无法启动 Codex App Server：\(detail)"
        case .timeout(let method): return "Codex App Server 响应超时：\(method)"
        case .server(let detail): return "Codex App Server 返回错误：\(detail)"
        }
    }
}

public struct CodexBinaryResolver: Sendable {
    public init() {}

    public func resolve(environment: [String: String] = ProcessInfo.processInfo.environment) throws -> URL {
        var candidates: [String] = []
        if let override = environment["BAND_DESK_CODEX_BIN"], !override.isEmpty { candidates.append(override) }
        candidates.append(contentsOf: [
            "/Applications/ChatGPT.app/Contents/Resources/codex",
            "/Applications/Codex.app/Contents/Resources/codex",
            "/opt/homebrew/bin/codex",
            "/usr/local/bin/codex"
        ])
        if let path = environment["PATH"] {
            candidates.append(contentsOf: path.split(separator: ":").map { "\($0)/codex" })
        }
        var seen = Set<String>()
        for candidate in candidates where seen.insert(candidate).inserted {
            guard FileManager.default.isExecutableFile(atPath: candidate) else { continue }
            if validates(URL(fileURLWithPath: candidate)) { return URL(fileURLWithPath: candidate) }
        }
        throw CodexClientError.binaryNotFound
    }

    private func validates(_ url: URL) -> Bool {
        let process = Process()
        process.executableURL = url
        process.arguments = ["--version"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do { try process.run(); process.waitUntilExit(); return process.terminationStatus == 0 }
        catch { return false }
    }
}

public final class CodexAppServerClient: @unchecked Sendable {
    private let resolver: CodexBinaryResolver
    private let timeout: TimeInterval

    public init(resolver: CodexBinaryResolver = CodexBinaryResolver(), timeout: TimeInterval = 15) {
        self.resolver = resolver
        self.timeout = timeout
    }

    public func fetchSnapshot(sourceID: String, sessionID: String, revision: Int64, now: Date = Date()) throws -> CodexSnapshot {
        let executable = try resolver.resolve()
        let process = Process()
        let input = Pipe(), output = Pipe(), errors = Pipe()
        process.executableURL = executable
        process.arguments = ["app-server", "--listen", "stdio://"]
        process.standardInput = input
        process.standardOutput = output
        process.standardError = errors
        let inbox = ResponseInbox(handle: output.fileHandleForReading)
        do { try process.run() }
        catch { throw CodexClientError.launchFailed(error.localizedDescription) }
        defer {
            output.fileHandleForReading.readabilityHandler = nil
            try? input.fileHandleForWriting.close()
            if process.isRunning { process.terminate() }
        }

        try write([
            "method": "initialize", "id": 0,
            "params": ["clientInfo": ["name": "band_desk_bridge", "title": "Band Desk Bridge", "version": "0.8.0"]]
        ], to: input.fileHandleForWriting)
        _ = try checkedResponse(try inbox.wait(id: 0, timeout: timeout), method: "initialize")
        try write(["method": "initialized", "params": [:]], to: input.fileHandleForWriting)
        try write(["method": "account/rateLimits/read", "id": 1], to: input.fileHandleForWriting)
        try write(["method": "account/usage/read", "id": 2], to: input.fileHandleForWriting)
        let rate = try checkedResponse(try inbox.wait(id: 1, timeout: timeout), method: "account/rateLimits/read")
        let usage = try checkedResponse(try inbox.wait(id: 2, timeout: timeout), method: "account/usage/read")
        return try CodexPayloadParser.snapshot(
            rateLimitResult: rate,
            usageResult: usage,
            sourceID: sourceID,
            sessionID: sessionID,
            revision: revision,
            now: now
        )
    }

    private func checkedResponse(_ response: [String: Any], method: String) throws -> [String: Any] {
        if let error = response["error"] as? [String: Any] {
            let message = (error["message"] as? String) ?? String(describing: error)
            throw CodexClientError.server("\(method)：\(message)")
        }
        guard let result = response["result"] as? [String: Any] else {
            throw PayloadError.invalidResponse(method)
        }
        return result
    }

    private func write(_ object: [String: Any], to handle: FileHandle) throws {
        var data = try JSONSerialization.data(withJSONObject: object)
        data.append(0x0a)
        do { try handle.write(contentsOf: data) }
        catch { throw CodexClientError.launchFailed(error.localizedDescription) }
    }
}

private final class ResponseInbox: @unchecked Sendable {
    private let condition = NSCondition()
    private var buffer = Data()
    private var responses: [Int: [String: Any]] = [:]

    init(handle: FileHandle) {
        handle.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self?.consume(data)
        }
    }

    func wait(id: Int, timeout: TimeInterval) throws -> [String: Any] {
        let deadline = Date().addingTimeInterval(timeout)
        condition.lock(); defer { condition.unlock() }
        while responses[id] == nil {
            if !condition.wait(until: deadline) { throw CodexClientError.timeout("id=\(id)") }
        }
        return responses.removeValue(forKey: id)!
    }

    private func consume(_ data: Data) {
        condition.lock(); defer { condition.unlock() }
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 0x0a) {
            let line = buffer[..<newline]
            buffer.removeSubrange(...newline)
            guard !line.isEmpty,
                  let object = try? JSONSerialization.jsonObject(with: Data(line)) as? [String: Any],
                  let id = (object["id"] as? NSNumber)?.intValue else { continue }
            responses[id] = object
        }
        condition.broadcast()
    }
}
