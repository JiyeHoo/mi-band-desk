// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "BandDeskBridge",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "BandDeskBridgeCore", targets: ["BandDeskBridgeCore"]),
        .executable(name: "BandDeskBridge", targets: ["BandDeskBridgeApp"]),
        .executable(name: "band-desk-probe", targets: ["BandDeskBridgeProbe"])
    ],
    targets: [
        .target(name: "BandDeskBridgeCore"),
        .executableTarget(name: "BandDeskBridgeApp", dependencies: ["BandDeskBridgeCore"]),
        .executableTarget(name: "BandDeskBridgeProbe", dependencies: ["BandDeskBridgeCore"]),
        .testTarget(name: "BandDeskBridgeCoreTests", dependencies: ["BandDeskBridgeCore"])
    ]
)
