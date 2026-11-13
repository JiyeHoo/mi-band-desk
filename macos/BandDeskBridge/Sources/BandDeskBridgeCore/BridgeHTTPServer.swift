import Foundation
import Network

public final class BridgeHTTPServer: @unchecked Sendable {
    public typealias StateHandler = @Sendable (String) -> Void
    public typealias EventHandler = @Sendable (Data) -> Void

    private let store: SnapshotStore
    private let queue = DispatchQueue(label: "com.jiyehoo.banddesk.bridge.http")
    private let onState: StateHandler
    private let onEvent: EventHandler
    private var listener: NWListener?

    public init(store: SnapshotStore, onState: @escaping StateHandler = { _ in }, onEvent: @escaping EventHandler = { _ in }) {
        self.store = store
        self.onState = onState
        self.onEvent = onEvent
    }

    public func start(port: UInt16 = BridgeConstants.port) throws {
        guard listener == nil else { return }
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        let listener = try NWListener(using: parameters)
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready: self?.onState("127.0.0.1:\(port)")
            case .failed(let error): self?.onState("失败：\(error.localizedDescription)")
            case .cancelled: self?.onState("已停止")
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        self.listener = listener
        listener.start(queue: queue)
    }

    public func stop() {
        listener?.cancel()
        listener = nil
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(connection, buffer: Data())
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var updated = buffer
            if let data { updated.append(data) }
            if self.requestIsComplete(updated) || complete || error != nil {
                self.respond(to: connection, request: updated)
            } else {
                self.receive(connection, buffer: updated)
            }
        }
    }

    private func requestIsComplete(_ data: Data) -> Bool {
        guard let text = String(data: data, encoding: .utf8), let range = text.range(of: "\r\n\r\n") else { return false }
        let headers = String(text[..<range.lowerBound])
        let length = headers.split(separator: "\n").first { $0.lowercased().hasPrefix("content-length:") }
            .flatMap { Int($0.split(separator: ":", maxSplits: 1).last?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "") } ?? 0
        return text[range.upperBound...].utf8.count >= length
    }

    private func respond(to connection: NWConnection, request data: Data) {
        guard let request = String(data: data, encoding: .utf8),
              let firstLine = request.split(separator: "\n", maxSplits: 1).first else {
            send(connection, status: 400, body: json(["error": "bad_request"]))
            return
        }
        let parts = firstLine.trimmingCharacters(in: .whitespacesAndNewlines).split(separator: " ")
        guard parts.count >= 2 else { send(connection, status: 400, body: json(["error": "bad_request"])); return }
        let method = String(parts[0]), path = String(parts[1])
        switch (method, path) {
        case ("GET", "/v1/health"):
            let snapshot = store.snapshot()
            send(connection, status: 200, body: json([
                "status": "ok",
                "snapshotAvailable": snapshot != nil,
                "lastFetchedAt": snapshot.map { NSNumber(value: $0.fetchedAt) } ?? NSNull()
            ]))
        case ("GET", "/v1/snapshot"):
            guard let snapshot = store.snapshot(), let body = try? JSONEncoder().encode(snapshot) else {
                send(connection, status: 503, body: json(["error": "snapshot_unavailable"])); return
            }
            send(connection, status: 200, body: body)
        case ("POST", "/v1/events"):
            if let separator = data.range(of: Data("\r\n\r\n".utf8)) {
                onEvent(Data(data[separator.upperBound...]))
            }
            send(connection, status: 202, body: json(["status": "accepted"]))
        default:
            send(connection, status: 404, body: json(["error": "not_found"]))
        }
    }

    private func json(_ object: [String: Any]) -> Data {
        (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
    }

    private func send(_ connection: NWConnection, status: Int, body: Data) {
        let reason: String
        switch status { case 200: reason = "OK"; case 202: reason = "Accepted"; case 400: reason = "Bad Request"; case 404: reason = "Not Found"; default: reason = "Service Unavailable" }
        let header = "HTTP/1.1 \(status) \(reason)\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n"
        var response = Data(header.utf8); response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
}
