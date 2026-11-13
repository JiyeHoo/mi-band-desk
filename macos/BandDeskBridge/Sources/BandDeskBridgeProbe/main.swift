import BandDeskBridgeCore
import Foundation

do {
    let snapshot = try CodexAppServerClient().fetchSnapshot(
        sourceID: "band-desk-probe",
        sessionID: UUID().uuidString,
        revision: 1
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    FileHandle.standardOutput.write(try encoder.encode(snapshot))
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("Band Desk Bridge probe failed: \(error.localizedDescription)\n".utf8))
    exit(1)
}
