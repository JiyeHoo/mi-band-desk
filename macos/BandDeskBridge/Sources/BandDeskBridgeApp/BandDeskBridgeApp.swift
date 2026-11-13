import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.setActivationPolicy(.accessory)
    }
}

@main
struct BandDeskBridgeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = BridgeViewModel()

    var body: some Scene {
        MenuBarExtra("Band Desk Bridge", systemImage: "watch.analog") {
            ContentView(model: model)
        }
        .menuBarExtraStyle(.window)
    }
}
