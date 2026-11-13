import XCTest
@testable import BandDeskBridgeCore

final class CodexPayloadParserTests: XCTestCase {
    func testBuildsSnapshotFromMultiBucketResponseAndSelectsLongestCodexWindow() throws {
        let rates: [String: Any] = [
            "rateLimits": ["limitId": "codex", "planType": "self_serve_business_prolite"],
            "rateLimitsByLimitId": [
                "codex": [
                    "limitId": "codex",
                    "planType": "self_serve_business_prolite",
                    "primary": ["usedPercent": 25, "windowDurationMins": 300, "resetsAt": 1_800_000_000],
                    "secondary": ["usedPercent": 3, "windowDurationMins": 10_080, "resetsAt": 1_800_100_000]
                ]
            ]
        ]
        let usage: [String: Any] = ["summary": ["lifetimeTokens": 123_456, "peakDailyTokens": 4_321, "currentStreakDays": 8, "longestStreakDays": 14]]
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let snapshot = try CodexPayloadParser.snapshot(rateLimitResult: rates, usageResult: usage, sourceID: "mac", sessionID: "session", revision: 7, now: now)

        XCTAssertEqual(snapshot.schemaVersion, 1)
        XCTAssertEqual(snapshot.payload.selectedWindowId, "codex.secondary")
        XCTAssertEqual(snapshot.selectedWindow?.remainingPercent, 97)
        XCTAssertEqual(snapshot.selectedWindow?.resetsAt, 1_800_100_000_000)
        XCTAssertEqual(snapshot.payload.usage?.lifetimeTokens, 123_456)
        XCTAssertEqual(snapshot.payload.planType, "self_serve_business_prolite")
        XCTAssertEqual(snapshot.expiresAt - snapshot.fetchedAt, 600_000)
    }

    func testLegacyBucketClampsPercentagesAndRejectsEmptyResponses() throws {
        let rates: [String: Any] = ["rateLimits": [
            "limitId": "codex", "primary": ["usedPercent": 130, "windowDurationMins": 60, "resetsAt": 1_800_000_000]
        ]]
        let snapshot = try CodexPayloadParser.snapshot(rateLimitResult: rates, usageResult: [:], sourceID: "mac", sessionID: "session", revision: 1)
        XCTAssertEqual(snapshot.selectedWindow?.usedPercent, 100)
        XCTAssertEqual(snapshot.selectedWindow?.remainingPercent, 0)
        XCTAssertThrowsError(try CodexPayloadParser.snapshot(rateLimitResult: [:], usageResult: [:], sourceID: "mac", sessionID: "session", revision: 1))
    }

    func testProtocolRoundTripsWithoutCredentialsOrAccountIdentity() throws {
        let snapshot = CodexSnapshot(
            sourceId: "source",
            revision: 1,
            sessionId: "session",
            fetchedAt: 1_790_000_000_000,
            payload: SnapshotPayload(selectedWindowId: "codex.primary", windows: [
                RateWindow(id: "codex.primary", label: "本周", usedPercent: 3, remainingPercent: 97, windowDurationMins: 10_080, resetsAt: 1_800_000_000_000)
            ], usage: nil)
        )
        let encoded = try JSONEncoder().encode(snapshot)
        let text = String(decoding: encoded, as: UTF8.self)
        XCTAssertFalse(text.contains("token"))
        XCTAssertFalse(text.contains("email"))
        XCTAssertEqual(try JSONDecoder().decode(CodexSnapshot.self, from: encoded), snapshot)
    }
}
