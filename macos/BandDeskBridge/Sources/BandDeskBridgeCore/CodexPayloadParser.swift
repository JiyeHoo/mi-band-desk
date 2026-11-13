import Foundation

public enum PayloadError: LocalizedError {
    case missingRateLimits
    case invalidResponse(String)

    public var errorDescription: String? {
        switch self {
        case .missingRateLimits: return "Codex 未返回可用额度窗口"
        case .invalidResponse(let detail): return "Codex 响应格式无效：\(detail)"
        }
    }
}

public enum CodexPayloadParser {
    public static func snapshot(
        rateLimitResult: [String: Any],
        usageResult: [String: Any],
        sourceID: String,
        sessionID: String,
        revision: Int64,
        now: Date = Date()
    ) throws -> CodexSnapshot {
        var buckets: [(String, [String: Any])] = []
        if let mapped = rateLimitResult["rateLimitsByLimitId"] as? [String: Any] {
            for key in mapped.keys.sorted() {
                if let bucket = mapped[key] as? [String: Any] { buckets.append((key, bucket)) }
            }
        }
        let legacy = rateLimitResult["rateLimits"] as? [String: Any]
        let fallbackPlanType = legacy?["planType"] as? String
        if buckets.isEmpty, let legacy {
            buckets.append(((legacy["limitId"] as? String) ?? "codex", legacy))
        }

        var windows: [RateWindow] = []
        var planTypes: [String: String] = [:]
        for (fallbackID, bucket) in buckets {
            let limitID = (bucket["limitId"] as? String) ?? fallbackID
            let limitName = bucket["limitName"] as? String
            if let planType = bucket["planType"] as? String, !planType.isEmpty { planTypes[limitID] = planType }
            for slot in ["primary", "secondary"] {
                guard let raw = bucket[slot] as? [String: Any],
                      let used = number(raw["usedPercent"]),
                      let duration = number(raw["windowDurationMins"]), duration > 0,
                      let resetSeconds = number(raw["resetsAt"]) else { continue }
                let bounded = min(100, max(0, used))
                let label = windowLabel(duration: duration, limitName: limitName)
                windows.append(RateWindow(
                    id: "\(limitID).\(slot)",
                    label: label,
                    usedPercent: bounded,
                    remainingPercent: 100 - bounded,
                    windowDurationMins: duration,
                    resetsAt: Int64(resetSeconds * 1_000)
                ))
            }
        }
        guard !windows.isEmpty else { throw PayloadError.missingRateLimits }
        windows.sort { lhs, rhs in
            if lhs.windowDurationMins == rhs.windowDurationMins { return lhs.id < rhs.id }
            return lhs.windowDurationMins > rhs.windowDurationMins
        }
        let selected = windows.first { $0.id.hasPrefix("codex.") } ?? windows[0]
        let summary = usageResult["summary"] as? [String: Any]
        let usage = summary.map {
            UsageSummary(
                lifetimeTokens: integer64($0["lifetimeTokens"]),
                peakDailyTokens: integer64($0["peakDailyTokens"]),
                currentStreakDays: integer($0["currentStreakDays"]),
                longestStreakDays: integer($0["longestStreakDays"])
            )
        }
        let nowMilliseconds = Int64(now.timeIntervalSince1970 * 1_000)
        let selectedLimitID = selected.id.split(separator: ".").dropLast().joined(separator: ".")
        return CodexSnapshot(
            sourceId: sourceID,
            revision: revision,
            sessionId: sessionID,
            fetchedAt: nowMilliseconds,
            payload: SnapshotPayload(selectedWindowId: selected.id, windows: windows, usage: usage, planType: planTypes[selectedLimitID] ?? fallbackPlanType)
        )
    }

    private static func windowLabel(duration: Double, limitName: String?) -> String {
        if duration >= 7 * 24 * 60 { return "本周" }
        if duration >= 24 * 60 { return "\(Int(duration / (24 * 60))) 天" }
        if duration >= 60 { return "\(Int(duration / 60)) 小时" }
        if let limitName, !limitName.isEmpty { return limitName }
        return "短时"
    }

    private static func number(_ value: Any?) -> Double? {
        if let number = value as? NSNumber { return number.doubleValue }
        if let string = value as? String { return Double(string) }
        return nil
    }

    private static func integer64(_ value: Any?) -> Int64? { number(value).map { Int64($0) } }
    private static func integer(_ value: Any?) -> Int? { number(value).map { Int($0) } }
}
