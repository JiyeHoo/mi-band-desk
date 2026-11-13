import Foundation

public enum BridgeConstants {
    public static let schemaVersion = 1
    public static let cardID = "codex.rate-limits"
    public static let port: UInt16 = 17_373
    public static let expiryMilliseconds: Int64 = 10 * 60 * 1_000
}

public struct RateWindow: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let label: String
    public let usedPercent: Double
    public let remainingPercent: Double
    public let windowDurationMins: Double
    public let resetsAt: Int64

    public init(id: String, label: String, usedPercent: Double, remainingPercent: Double, windowDurationMins: Double, resetsAt: Int64) {
        self.id = id
        self.label = label
        self.usedPercent = usedPercent
        self.remainingPercent = remainingPercent
        self.windowDurationMins = windowDurationMins
        self.resetsAt = resetsAt
    }
}

public struct UsageSummary: Codable, Equatable, Sendable {
    public let lifetimeTokens: Int64?
    public let peakDailyTokens: Int64?
    public let currentStreakDays: Int?
    public let longestStreakDays: Int?

    public init(lifetimeTokens: Int64?, peakDailyTokens: Int64?, currentStreakDays: Int?, longestStreakDays: Int?) {
        self.lifetimeTokens = lifetimeTokens
        self.peakDailyTokens = peakDailyTokens
        self.currentStreakDays = currentStreakDays
        self.longestStreakDays = longestStreakDays
    }
}

public struct SnapshotPayload: Codable, Equatable, Sendable {
    public let selectedWindowId: String
    public let windows: [RateWindow]
    public let usage: UsageSummary?
    public let planType: String?

    public init(selectedWindowId: String, windows: [RateWindow], usage: UsageSummary?, planType: String? = nil) {
        self.selectedWindowId = selectedWindowId
        self.windows = windows
        self.usage = usage
        self.planType = planType
    }
}

public struct CodexSnapshot: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let type: String
    public let cardId: String
    public let sourceId: String
    public let accountKey: String
    public let revision: Int64
    public let sessionId: String
    public let fetchedAt: Int64
    public let expiresAt: Int64
    public let payload: SnapshotPayload

    public init(sourceId: String, revision: Int64, sessionId: String, fetchedAt: Int64, payload: SnapshotPayload) {
        self.schemaVersion = BridgeConstants.schemaVersion
        self.type = "snapshot"
        self.cardId = BridgeConstants.cardID
        self.sourceId = sourceId
        self.accountKey = "default"
        self.revision = revision
        self.sessionId = sessionId
        self.fetchedAt = fetchedAt
        self.expiresAt = fetchedAt + BridgeConstants.expiryMilliseconds
        self.payload = payload
    }

    public var selectedWindow: RateWindow? {
        payload.windows.first { $0.id == payload.selectedWindowId } ?? payload.windows.max { $0.windowDurationMins < $1.windowDurationMins }
    }

    public func isExpired(at date: Date = Date()) -> Bool {
        Int64(date.timeIntervalSince1970 * 1_000) > expiresAt
    }
}

public final class SnapshotStore: @unchecked Sendable {
    private let lock = NSLock()
    private var value: CodexSnapshot?

    public init(_ initial: CodexSnapshot? = nil) { value = initial }

    public func update(_ snapshot: CodexSnapshot) {
        lock.lock(); defer { lock.unlock() }
        value = snapshot
    }

    public func snapshot() -> CodexSnapshot? {
        lock.lock(); defer { lock.unlock() }
        return value
    }
}
