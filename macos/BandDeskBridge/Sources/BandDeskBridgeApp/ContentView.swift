import BandDeskBridgeCore
import SwiftUI

struct ContentView: View {
    @ObservedObject var model: BridgeViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            if let selected = model.snapshot?.selectedWindow { quota(selected) }
            else { emptyQuota }
            if let usage = model.snapshot?.payload.usage { usageView(usage) }
            Divider()
            VStack(alignment: .leading, spacing: 9) {
                Text("连接链路").font(.headline)
                status("Codex App Server", model.codexStatus, good: model.snapshot != nil)
                status("本机桥", model.bridgeStatus, good: model.bridgeStatus.hasPrefix("127."))
                status("AstroBox 插件", model.astroBoxStatus, good: model.astroBoxStatus.contains("已转发"))
                status("手环确认", model.bandStatus, good: model.bandStatus.contains("已确认"))
            }
            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("错误：\(error)")
            }
            HStack {
                Button { model.refresh() } label: {
                    if model.isRefreshing { ProgressView().controlSize(.small) }
                    else { Label("立即刷新", systemImage: "arrow.clockwise") }
                }
                .disabled(model.isRefreshing)
                .accessibilityLabel(model.isRefreshing ? "正在刷新 Codex 数据" : "立即刷新 Codex 数据")
                Spacer()
                Button("打开 AstroBox") { model.openAstroBox() }
                    .accessibilityLabel("打开 AstroBox 应用")
            }
            Text("仅监听本机 127.0.0.1，不保存 Codex 账号凭据")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(18)
        .frame(width: 380)
        .task { model.start() }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Band Desk Bridge").font(.title3.bold())
                Text("Codex 卡片 · Mac 直连").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if model.snapshot?.isExpired() == true { Text("数据过期").foregroundStyle(.orange) }
            else if model.snapshot != nil { Text("已同步").foregroundStyle(.mint) }
        }
    }

    private func quota(_ window: RateWindow) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(window.label)剩余 · \(planLabel(model.snapshot?.payload.planType))").font(.caption).foregroundStyle(.secondary)
                    Text("\(Int(window.remainingPercent.rounded()))%")
                        .font(.system(size: 42, weight: .semibold, design: .rounded))
                }
                Spacer()
                Text(resetText(window.resetsAt)).font(.subheadline).foregroundStyle(.secondary)
            }
            ProgressView(value: window.remainingPercent, total: 100).tint(.mint)
                .accessibilityLabel("\(window.label)剩余额度")
                .accessibilityValue("百分之 \(Int(window.remainingPercent.rounded()))")
            if let windows = model.snapshot?.payload.windows, windows.count > 1 {
                ForEach(windows.filter { $0.id != window.id }) { item in
                    HStack { Text(item.label); Spacer(); Text("\(Int(item.remainingPercent.rounded()))%") }
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(14).background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }

    private var emptyQuota: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("等待 Codex 数据").font(.headline)
            Text("启动后会通过本机 Codex App Server 读取额度；失败时请按下方错误提示处理。")
                .font(.caption).foregroundStyle(.secondary)
        }
        .padding(14).background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
    }

    private func usageView(_ usage: UsageSummary) -> some View {
        HStack(spacing: 12) {
            metric("累计 Token", usage.lifetimeTokens.map(compact) ?? "—")
            Divider().frame(height: 32)
            metric("峰值 / 日", usage.peakDailyTokens.map(compact) ?? "—")
            Divider().frame(height: 32)
            metric("连续使用", usage.currentStreakDays.map { "\($0) 天" } ?? "—")
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(value).font(.headline); Text(label).font(.caption2).foregroundStyle(.secondary) }
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func status(_ title: String, _ value: String, good: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: good ? "checkmark.circle.fill" : "circle.dotted")
                .foregroundColor(good ? .mint : .secondary)
            Text(title); Spacer(); Text(value).foregroundStyle(.secondary).lineLimit(1)
        }.font(.caption)
    }

    private func compact(_ value: Int64) -> String {
        if value >= 1_000_000 { return String(format: "%.1fM", Double(value) / 1_000_000) }
        if value >= 1_000 { return String(format: "%.1fK", Double(value) / 1_000) }
        return "\(value)"
    }

    private func planLabel(_ planType: String?) -> String {
        switch planType {
        case "free": return "FREE"
        case "go": return "GO"
        case "plus": return "PLUS"
        case "pro": return "Pro 20×"
        case "prolite": return "Pro 5×"
        case "team": return "TEAM"
        case "self_serve_business_prolite": return "BIZ PRO LITE"
        case "self_serve_business_usage_based", "business": return "BUSINESS"
        case "ent26", "enterprise_cbp_automation", "enterprise_cbp_usage_based", "enterprise": return "ENTERPRISE"
        case "edu": return "EDU"
        case "edu_plus": return "EDU PLUS"
        case "edu_pro": return "EDU PRO"
        default: return "CODEX"
        }
    }

    private func resetText(_ milliseconds: Int64) -> String {
        let seconds = max(0, Int(Double(milliseconds) / 1_000 - Date().timeIntervalSince1970))
        if seconds >= 86_400 { return "\(seconds / 86_400) 天 \((seconds % 86_400) / 3_600) 小时后重置" }
        if seconds >= 3_600 { return "\(seconds / 3_600) 小时后重置" }
        return "\(max(1, seconds / 60)) 分钟后重置"
    }
}
