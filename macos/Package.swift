// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FlexworkMenuBar",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "FlexworkMenuBar", targets: ["FlexworkMenuBar"])],
    targets: [
        .executableTarget(name: "FlexworkMenuBar")
    ]
)
