#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <arpa/inet.h>
#import <netinet/in.h>
#import <sys/socket.h>
#import <unistd.h>

static const uint16_t BDPort = 17373;
static const long long BDExpiryMilliseconds = 10LL * 60LL * 1000LL;

static NSNumber *BDNumber(id value) {
    if ([value isKindOfClass:NSNumber.class]) return value;
    if ([value isKindOfClass:NSString.class]) return @([(NSString *)value doubleValue]);
    return nil;
}

static long long BDNowMilliseconds(void) {
    return (long long)(NSDate.date.timeIntervalSince1970 * 1000.0);
}

static NSString *BDCompactNumber(NSNumber *number) {
    if (!number || (id)number == NSNull.null) return @"—";
    double value = number.doubleValue;
    if (value >= 1000000) return [NSString stringWithFormat:@"%.1fM", value / 1000000.0];
    if (value >= 1000) return [NSString stringWithFormat:@"%.1fK", value / 1000.0];
    return [NSString stringWithFormat:@"%.0f", value];
}

static NSString *BDPlanLabel(NSString *planType) {
    NSDictionary<NSString *, NSString *> *labels = @{
        @"free": @"FREE", @"go": @"GO", @"plus": @"PLUS", @"pro": @"Pro 20×", @"prolite": @"Pro 5×",
        @"team": @"TEAM", @"self_serve_business_prolite": @"Business 5×",
        @"self_serve_business_usage_based": @"BUSINESS", @"business": @"BUSINESS", @"ent26": @"ENTERPRISE",
        @"enterprise_cbp_automation": @"ENTERPRISE", @"enterprise_cbp_usage_based": @"ENTERPRISE",
        @"enterprise": @"ENTERPRISE", @"edu": @"EDU", @"edu_plus": @"EDU PLUS", @"edu_pro": @"EDU PRO"
    };
    return labels[planType] ?: @"CODEX";
}

static NSData *BDJSONData(id object) {
    return [NSJSONSerialization dataWithJSONObject:object options:0 error:nil] ?: [@"{}" dataUsingEncoding:NSUTF8StringEncoding];
}

static NSRange BDHeaderSeparator(NSData *data) {
    NSData *marker = [@"\r\n\r\n" dataUsingEncoding:NSASCIIStringEncoding];
    return [data rangeOfData:marker options:0 range:NSMakeRange(0, data.length)];
}

static NSString *BDHeaderText(NSData *data, NSRange separator) {
    if (separator.location == NSNotFound) return nil;
    NSData *header = [data subdataWithRange:NSMakeRange(0, separator.location)];
    return [[NSString alloc] initWithData:header encoding:NSUTF8StringEncoding];
}

static NSInteger BDContentLength(NSString *headers) {
    for (NSString *line in [headers componentsSeparatedByString:@"\r\n"]) {
        if ([[line lowercaseString] hasPrefix:@"content-length:"]) return MAX(0, [[line componentsSeparatedByString:@":"].lastObject integerValue]);
    }
    return 0;
}

static BOOL BDUsesChunkedTransfer(NSString *headers) {
    for (NSString *line in [headers componentsSeparatedByString:@"\r\n"]) {
        if ([[line lowercaseString] hasPrefix:@"transfer-encoding:"] && [[line lowercaseString] containsString:@"chunked"]) return YES;
    }
    return NO;
}

static BOOL BDChunkedBodyIsComplete(NSData *body) {
    NSData *ending = [@"0\r\n\r\n" dataUsingEncoding:NSASCIIStringEncoding];
    return [body rangeOfData:ending options:NSDataSearchBackwards range:NSMakeRange(0, body.length)].location != NSNotFound;
}

static NSData *BDDecodeChunkedBody(NSData *body) {
    const uint8_t *bytes = body.bytes;
    NSUInteger cursor = 0;
    NSMutableData *decoded = NSMutableData.data;
    NSData *lineEnding = [@"\r\n" dataUsingEncoding:NSASCIIStringEncoding];
    while (cursor < body.length) {
        NSRange line = [body rangeOfData:lineEnding options:0 range:NSMakeRange(cursor, body.length - cursor)];
        if (line.location == NSNotFound) return nil;
        NSData *sizeData = [body subdataWithRange:NSMakeRange(cursor, line.location - cursor)];
        NSString *sizeText = [[NSString alloc] initWithData:sizeData encoding:NSASCIIStringEncoding];
        sizeText = [[sizeText componentsSeparatedByString:@";"].firstObject stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        unsigned long long chunkSize = 0;
        NSScanner *scanner = [NSScanner scannerWithString:sizeText ?: @""];
        if (![scanner scanHexLongLong:&chunkSize] || !scanner.isAtEnd) return nil;
        cursor = NSMaxRange(line);
        if (chunkSize == 0) return decoded;
        if (chunkSize > NSUIntegerMax || cursor > body.length || (NSUInteger)chunkSize > body.length - cursor || body.length - cursor - (NSUInteger)chunkSize < 2) return nil;
        [decoded appendBytes:bytes + cursor length:(NSUInteger)chunkSize];
        cursor += (NSUInteger)chunkSize;
        if (bytes[cursor] != '\r' || bytes[cursor + 1] != '\n') return nil;
        cursor += 2;
    }
    return nil;
}

static NSData *BDRequestBody(NSData *request, NSString *headers, NSRange separator) {
    NSUInteger start = NSMaxRange(separator);
    if (start > request.length) return nil;
    NSData *raw = [request subdataWithRange:NSMakeRange(start, request.length - start)];
    if (BDUsesChunkedTransfer(headers)) return BDDecodeChunkedBody(raw);
    NSInteger length = BDContentLength(headers);
    if (length < 0 || raw.length < (NSUInteger)length) return nil;
    return [raw subdataWithRange:NSMakeRange(0, (NSUInteger)length)];
}

@interface BDResponseCollector : NSObject
@property(nonatomic) NSMutableData *buffer;
@property(nonatomic) NSMutableDictionary<NSNumber *, NSDictionary *> *responses;
@property(nonatomic) dispatch_semaphore_t semaphore;
- (void)consume:(NSData *)data;
- (NSDictionary *)waitForID:(NSNumber *)identifier timeout:(NSTimeInterval)timeout;
@end

@implementation BDResponseCollector
- (instancetype)init {
    if ((self = [super init])) {
        _buffer = NSMutableData.data;
        _responses = NSMutableDictionary.dictionary;
        _semaphore = dispatch_semaphore_create(0);
    }
    return self;
}
- (void)consume:(NSData *)data {
    @synchronized (self) {
        [self.buffer appendData:data];
        const uint8_t newline = '\n';
        while (true) {
            NSRange range = [self.buffer rangeOfData:[NSData dataWithBytes:&newline length:1] options:0 range:NSMakeRange(0, self.buffer.length)];
            if (range.location == NSNotFound) break;
            NSData *line = [self.buffer subdataWithRange:NSMakeRange(0, range.location)];
            [self.buffer replaceBytesInRange:NSMakeRange(0, range.location + 1) withBytes:NULL length:0];
            NSDictionary *object = line.length ? [NSJSONSerialization JSONObjectWithData:line options:0 error:nil] : nil;
            NSNumber *identifier = [object isKindOfClass:NSDictionary.class] ? object[@"id"] : nil;
            if ([identifier isKindOfClass:NSNumber.class]) self.responses[identifier] = object;
        }
    }
    dispatch_semaphore_signal(self.semaphore);
}
- (NSDictionary *)waitForID:(NSNumber *)identifier timeout:(NSTimeInterval)timeout {
    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeout];
    while (deadline.timeIntervalSinceNow > 0) {
        @synchronized (self) {
            NSDictionary *response = self.responses[identifier];
            if (response) { [self.responses removeObjectForKey:identifier]; return response; }
        }
        dispatch_semaphore_wait(self.semaphore, dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC));
    }
    return nil;
}
@end

@interface BDCodexClient : NSObject
- (NSDictionary *)fetchSourceID:(NSString *)sourceID sessionID:(NSString *)sessionID revision:(long long)revision error:(NSError **)error;
@end

@implementation BDCodexClient
- (NSString *)resolveBinary {
    NSMutableArray<NSString *> *candidates = NSMutableArray.array;
    NSString *override = NSProcessInfo.processInfo.environment[@"BAND_DESK_CODEX_BIN"];
    if (override.length) [candidates addObject:override];
    [candidates addObjectsFromArray:@[
        @"/Applications/ChatGPT.app/Contents/Resources/codex",
        @"/Applications/Codex.app/Contents/Resources/codex",
        @"/opt/homebrew/bin/codex", @"/usr/local/bin/codex"
    ]];
    for (NSString *folder in [NSProcessInfo.processInfo.environment[@"PATH"] componentsSeparatedByString:@":"]) {
        if (folder.length) [candidates addObject:[folder stringByAppendingPathComponent:@"codex"]];
    }
    NSMutableSet *seen = NSMutableSet.set;
    for (NSString *candidate in candidates) {
        if ([seen containsObject:candidate]) continue;
        [seen addObject:candidate];
        if (![NSFileManager.defaultManager isExecutableFileAtPath:candidate]) continue;
        NSTask *probe = NSTask.new;
        probe.executableURL = [NSURL fileURLWithPath:candidate];
        probe.arguments = @[@"--version"];
        probe.standardOutput = NSFileHandle.fileHandleWithNullDevice;
        probe.standardError = NSFileHandle.fileHandleWithNullDevice;
        if ([probe launchAndReturnError:nil]) { [probe waitUntilExit]; if (probe.terminationStatus == 0) return candidate; }
    }
    return nil;
}
- (BOOL)writeObject:(NSDictionary *)object to:(NSFileHandle *)handle error:(NSError **)error {
    NSData *json = [NSJSONSerialization dataWithJSONObject:object options:0 error:error];
    if (!json) return NO;
    NSMutableData *line = [json mutableCopy];
    [line appendBytes:"\n" length:1];
    @try { [handle writeData:line]; return YES; }
    @catch (NSException *exception) {
        if (error) *error = [NSError errorWithDomain:@"BandDeskBridge" code:2 userInfo:@{NSLocalizedDescriptionKey: exception.reason ?: @"写入 Codex App Server 失败"}];
        return NO;
    }
}
- (NSDictionary *)resultFrom:(NSDictionary *)response method:(NSString *)method error:(NSError **)error {
    NSDictionary *serverError = [response[@"error"] isKindOfClass:NSDictionary.class] ? response[@"error"] : nil;
    if (serverError) {
        if (error) *error = [NSError errorWithDomain:@"BandDeskBridge" code:3 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"%@：%@", method, serverError[@"message"] ?: @"服务返回错误"]}];
        return nil;
    }
    NSDictionary *result = [response[@"result"] isKindOfClass:NSDictionary.class] ? response[@"result"] : nil;
    if (!result && error) *error = [NSError errorWithDomain:@"BandDeskBridge" code:4 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"%@ 响应格式无效", method]}];
    return result;
}
- (NSDictionary *)fetchSourceID:(NSString *)sourceID sessionID:(NSString *)sessionID revision:(long long)revision error:(NSError **)error {
    NSString *binary = [self resolveBinary];
    if (!binary) {
        if (error) *error = [NSError errorWithDomain:@"BandDeskBridge" code:1 userInfo:@{NSLocalizedDescriptionKey:@"未找到可运行的 Codex；请启动或安装 ChatGPT/Codex，或设置 BAND_DESK_CODEX_BIN"}];
        return nil;
    }
    NSTask *task = NSTask.new;
    NSPipe *input = NSPipe.pipe, *output = NSPipe.pipe;
    task.executableURL = [NSURL fileURLWithPath:binary];
    task.arguments = @[@"app-server", @"--listen", @"stdio://"];
    task.standardInput = input;
    task.standardOutput = output;
    task.standardError = NSFileHandle.fileHandleWithNullDevice;
    BDResponseCollector *collector = BDResponseCollector.new;
    output.fileHandleForReading.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = handle.availableData;
        if (data.length) [collector consume:data];
    };
    if (![task launchAndReturnError:error]) { output.fileHandleForReading.readabilityHandler = nil; return nil; }
    void (^cleanup)(void) = ^{
        output.fileHandleForReading.readabilityHandler = nil;
        [input.fileHandleForWriting closeFile];
        if (task.running) [task terminate];
    };
    NSDictionary *initialize = @{ @"method": @"initialize", @"id": @0, @"params": @{ @"clientInfo": @{ @"name": @"band_desk_bridge", @"title": @"Band Desk Bridge", @"version": @"0.8.2" } } };
    if (![self writeObject:initialize to:input.fileHandleForWriting error:error]) { cleanup(); return nil; }
    NSDictionary *initializeResponse = [collector waitForID:@0 timeout:15];
    if (!initializeResponse) {
        if (error) *error = [NSError errorWithDomain:@"BandDeskBridge" code:5 userInfo:@{NSLocalizedDescriptionKey:@"Codex App Server 初始化超时"}];
        cleanup(); return nil;
    }
    if (![self resultFrom:initializeResponse method:@"initialize" error:error]) { cleanup(); return nil; }
    [self writeObject:@{ @"method": @"initialized", @"params": @{} } to:input.fileHandleForWriting error:nil];
    [self writeObject:@{ @"method": @"account/rateLimits/read", @"id": @1 } to:input.fileHandleForWriting error:nil];
    [self writeObject:@{ @"method": @"account/usage/read", @"id": @2 } to:input.fileHandleForWriting error:nil];
    NSDictionary *rateResponse = [collector waitForID:@1 timeout:15];
    NSDictionary *usageResponse = [collector waitForID:@2 timeout:15];
    if (!rateResponse || !usageResponse) {
        if (error) *error = [NSError errorWithDomain:@"BandDeskBridge" code:6 userInfo:@{NSLocalizedDescriptionKey:@"Codex 额度或使用统计读取超时"}];
        cleanup(); return nil;
    }
    NSDictionary *rateResult = [self resultFrom:rateResponse method:@"account/rateLimits/read" error:error];
    NSDictionary *usageResult = [self resultFrom:usageResponse method:@"account/usage/read" error:error];
    if (!rateResult || !usageResult) { cleanup(); return nil; }

    NSMutableArray<NSDictionary *> *buckets = NSMutableArray.array;
    NSDictionary *mapped = [rateResult[@"rateLimitsByLimitId"] isKindOfClass:NSDictionary.class] ? rateResult[@"rateLimitsByLimitId"] : nil;
    for (NSString *key in [[mapped allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
        NSDictionary *bucket = [mapped[key] isKindOfClass:NSDictionary.class] ? mapped[key] : nil;
        if (bucket) [buckets addObject:@{ @"fallback": key, @"value": bucket }];
    }
    NSDictionary *legacy = [rateResult[@"rateLimits"] isKindOfClass:NSDictionary.class] ? rateResult[@"rateLimits"] : nil;
    NSString *fallbackPlanType = [legacy[@"planType"] isKindOfClass:NSString.class] ? legacy[@"planType"] : nil;
    if (!buckets.count && legacy) [buckets addObject:@{ @"fallback": legacy[@"limitId"] ?: @"codex", @"value": legacy }];
    NSMutableArray<NSDictionary *> *windows = NSMutableArray.array;
    NSMutableDictionary<NSString *, NSString *> *planTypes = NSMutableDictionary.dictionary;
    for (NSDictionary *entry in buckets) {
        NSDictionary *bucket = entry[@"value"];
        NSString *limitID = [bucket[@"limitId"] isKindOfClass:NSString.class] ? bucket[@"limitId"] : entry[@"fallback"];
        NSString *planType = [bucket[@"planType"] isKindOfClass:NSString.class] ? bucket[@"planType"] : nil;
        if (planType.length) planTypes[limitID] = planType;
        for (NSString *slot in @[@"primary", @"secondary"]) {
            NSDictionary *raw = [bucket[slot] isKindOfClass:NSDictionary.class] ? bucket[slot] : nil;
            NSNumber *used = BDNumber(raw[@"usedPercent"]), *duration = BDNumber(raw[@"windowDurationMins"]), *reset = BDNumber(raw[@"resetsAt"]);
            if (!raw || !used || !duration || duration.doubleValue <= 0 || !reset) continue;
            double bounded = MIN(100, MAX(0, used.doubleValue));
            NSString *label = duration.doubleValue >= 10080 ? @"本周" : duration.doubleValue >= 1440 ? [NSString stringWithFormat:@"%d 天", (int)(duration.doubleValue / 1440)] : duration.doubleValue >= 60 ? [NSString stringWithFormat:@"%d 小时", (int)(duration.doubleValue / 60)] : @"短时";
            [windows addObject:@{ @"id": [NSString stringWithFormat:@"%@.%@", limitID, slot], @"label": label, @"usedPercent": @(bounded), @"remainingPercent": @(100 - bounded), @"windowDurationMins": duration, @"resetsAt": @((long long)(reset.doubleValue * 1000.0)) }];
        }
    }
    [windows sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
        double a = [left[@"windowDurationMins"] doubleValue], b = [right[@"windowDurationMins"] doubleValue];
        if (a == b) return [left[@"id"] compare:right[@"id"]];
        return a > b ? NSOrderedAscending : NSOrderedDescending;
    }];
    if (!windows.count) {
        if (error) *error = [NSError errorWithDomain:@"BandDeskBridge" code:7 userInfo:@{NSLocalizedDescriptionKey:@"Codex 未返回可用额度窗口"}];
        cleanup(); return nil;
    }
    NSDictionary *selected = windows.firstObject;
    for (NSDictionary *window in windows) if ([window[@"id"] hasPrefix:@"codex."]) { selected = window; break; }
    NSDictionary *summary = [usageResult[@"summary"] isKindOfClass:NSDictionary.class] ? usageResult[@"summary"] : @{};
    NSDictionary *usage = @{ @"lifetimeTokens": BDNumber(summary[@"lifetimeTokens"]) ?: NSNull.null, @"peakDailyTokens": BDNumber(summary[@"peakDailyTokens"]) ?: NSNull.null, @"currentStreakDays": BDNumber(summary[@"currentStreakDays"]) ?: NSNull.null, @"longestStreakDays": BDNumber(summary[@"longestStreakDays"]) ?: NSNull.null };
    long long now = BDNowMilliseconds();
    NSString *selectedID = selected[@"id"];
    NSRange suffix = [selectedID rangeOfString:@"." options:NSBackwardsSearch];
    NSString *selectedLimitID = suffix.location == NSNotFound ? selectedID : [selectedID substringToIndex:suffix.location];
    NSMutableDictionary *payload = [@{ @"selectedWindowId": selectedID, @"windows": windows, @"usage": usage } mutableCopy];
    NSString *selectedPlanType = planTypes[selectedLimitID] ?: fallbackPlanType;
    if (selectedPlanType.length) payload[@"planType"] = selectedPlanType;
    NSDictionary *snapshot = @{ @"schemaVersion": @1, @"type": @"snapshot", @"cardId": @"codex.rate-limits", @"sourceId": sourceID, @"accountKey": @"default", @"revision": @(revision), @"sessionId": sessionID, @"fetchedAt": @(now), @"expiresAt": @(now + BDExpiryMilliseconds), @"payload": payload };
    cleanup();
    return snapshot;
}
@end

@interface BDSnapshotStore : NSObject
@property(nonatomic) NSDictionary *value;
@property(nonatomic) NSDictionary *eventState;
- (NSDictionary *)snapshot;
- (void)update:(NSDictionary *)snapshot;
- (BOOL)recordEvent:(NSDictionary *)event;
- (BOOL)recordEvent:(NSDictionary *)event at:(long long)at;
- (NSDictionary *)status;
@end

static BOOL BDSameRevision(NSDictionary *snapshot, NSDictionary *event, NSString *sessionKey, NSString *revisionKey) {
    return [snapshot[@"sessionId"] isKindOfClass:NSString.class] && [snapshot[@"sessionId"] isEqual:event[sessionKey]] &&
        [event[revisionKey] isKindOfClass:NSNumber.class] && [snapshot[@"revision"] isEqual:event[revisionKey]];
}

static NSDictionary *BDConnectionState(NSDictionary *snapshot, NSDictionary *state, long long now) {
    NSString *relay = state[@"lastRelayStatus"] ?: @"";
    BOOL recent = state[@"lastRelayAt"] && now - [state[@"lastRelayAt"] longLongValue] < 45000;
    BOOL acked = BDSameRevision(snapshot, state, @"lastAckSessionId", @"lastAckRevision");
    BOOL sent = BDSameRevision(snapshot, state, @"lastSentSessionId", @"lastSentRevision");
    NSString *bandState = acked ? @"confirmed" : sent ? (now - [state[@"lastSentAt"] longLongValue] >= 30000 ? @"timeout" : @"pending") : @"not_sent";
    NSString *band = acked ? @"已确认最新数据" : [bandState isEqual:@"timeout"] ? @"未收到回执 · 请打开桌搭" : sent ? @"等待手环确认" : @"等待转发最新数据";
    NSDictionary *labels = @{ @"sent": @"已转发快照", @"no_device": @"未连接手环", @"mac_unreachable": @"无法读取额度", @"send_failed": @"发送失败", @"invalid_band_event": @"回执格式异常" };
    NSString *plugin = recent ? (labels[relay] ?: @"插件已响应") : state[@"lastRelayAt"] ? @"插件响应超时" : @"等待插件连接";
    if (recent && [relay isEqual:@"no_device"]) { band = @"手环未连接"; bandState = @"disconnected"; }
    else if (!recent && state[@"lastRelayAt"]) { band = acked ? @"曾确认 · 连接待恢复" : @"等待连接恢复"; bandState = @"offline"; }
    else if (recent && [relay isEqual:@"send_failed"] && !acked) { band = @"发送失败 · 等待重试"; bandState = @"send_failed"; }
    return @{ @"bandText": band, @"bandState": bandState, @"ackMatchesSnapshot": @(acked), @"pluginText": plugin,
              @"pluginGood": @(recent && [relay isEqual:@"sent"]), @"bandGood": @([bandState isEqual:@"confirmed"]) };
}

@implementation BDSnapshotStore
- (NSDictionary *)snapshot { @synchronized (self) { return self.value; } }
- (void)update:(NSDictionary *)snapshot { @synchronized (self) { self.value = snapshot; } }
- (BOOL)recordEvent:(NSDictionary *)event { return [self recordEvent:event at:BDNowMilliseconds()]; }
- (BOOL)recordEvent:(NSDictionary *)event at:(long long)at {
    @synchronized (self) {
        NSMutableDictionary *state = [self.eventState mutableCopy] ?: NSMutableDictionary.dictionary;
        NSNumber *now = @(at);
        if ([event[@"kind"] isEqual:@"relay_status"] && [event[@"status"] isKindOfClass:NSString.class]) {
            state[@"lastRelayStatus"] = event[@"status"];
            state[@"lastRelayAt"] = now;
            if ([event[@"status"] isEqual:@"sent"] && BDSameRevision(self.value, event, @"sessionId", @"revision") &&
                !BDSameRevision(self.value, state, @"lastSentSessionId", @"lastSentRevision")) {
                state[@"lastSentRevision"] = event[@"revision"]; state[@"lastSentSessionId"] = event[@"sessionId"]; state[@"lastSentAt"] = now;
            }
        } else {
            if (![event[@"schemaVersion"] isEqual:@1] || ![event[@"cardId"] isEqual:@"codex.rate-limits"] ||
                ![event[@"sessionId"] isKindOfClass:NSString.class] || ![event[@"revision"] isKindOfClass:NSNumber.class] ||
                [event[@"revision"] longLongValue] < 0) return NO;
            if ([event[@"type"] isEqual:@"ack"]) {
                // Delayed ACKs remain harmless, but only this snapshot can turn
                // the current confirmation green. A retry must not erase it.
                if (BDSameRevision(self.value, event, @"sessionId", @"revision")) {
                    state[@"lastAckRevision"] = event[@"revision"]; state[@"lastAckSessionId"] = event[@"sessionId"]; state[@"lastAckAt"] = now;
                }
            } else if ([event[@"type"] isEqual:@"refresh_request"]) state[@"lastRefreshRequestAt"] = now;
            else return NO;
        }
        self.eventState = state;
        return YES;
    }
}
- (NSDictionary *)status { @synchronized (self) { return self.eventState ?: @{}; } }
@end

@interface BDHTTPServer : NSObject
@property(nonatomic) int descriptor;
@property(nonatomic) BDSnapshotStore *store;
@property(nonatomic, copy) void (^eventHandler)(NSDictionary *event);
- (BOOL)start:(NSError **)error;
@end

@implementation BDHTTPServer
- (BOOL)start:(NSError **)error {
    self.descriptor = socket(AF_INET, SOCK_STREAM, 0);
    if (self.descriptor < 0) {
        if (error) *error = [NSError errorWithDomain:NSPOSIXErrorDomain code:errno userInfo:@{NSLocalizedDescriptionKey:[NSString stringWithFormat:@"本机桥启动失败：%s", strerror(errno)]}];
        return NO;
    }
    int yes = 1;
    setsockopt(self.descriptor, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    struct sockaddr_in address = {0};
    address.sin_len = sizeof(address); address.sin_family = AF_INET; address.sin_port = htons(BDPort); address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(self.descriptor, (struct sockaddr *)&address, sizeof(address)) != 0 || listen(self.descriptor, 8) != 0) {
        int code = errno; close(self.descriptor); self.descriptor = -1;
        if (error) *error = [NSError errorWithDomain:NSPOSIXErrorDomain code:code userInfo:@{NSLocalizedDescriptionKey:[NSString stringWithFormat:@"本机桥启动失败：%s", strerror(code)]}];
        return NO;
    }
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        while (true) {
            int client = accept(self.descriptor, NULL, NULL);
            if (client < 0) continue;
            dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ [self handleClient:client]; });
        }
    });
    return YES;
}
- (void)handleClient:(int)client {
    int yes = 1; setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes));
    struct timeval timeout = {2, 0}; setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    NSMutableData *requestData = NSMutableData.data;
    char buffer[4096]; ssize_t count;
    while ((count = recv(client, buffer, sizeof(buffer), 0)) > 0 && requestData.length < 65536) {
        [requestData appendBytes:buffer length:(NSUInteger)count];
        NSRange separator = BDHeaderSeparator(requestData);
        if (separator.location != NSNotFound) {
            NSString *headers = BDHeaderText(requestData, separator) ?: @"";
            NSUInteger bodyStart = NSMaxRange(separator);
            NSData *body = requestData.length >= bodyStart ? [requestData subdataWithRange:NSMakeRange(bodyStart, requestData.length - bodyStart)] : NSData.data;
            if (BDUsesChunkedTransfer(headers) ? BDChunkedBodyIsComplete(body) : body.length >= (NSUInteger)BDContentLength(headers)) break;
        }
    }
    NSString *request = [[NSString alloc] initWithData:requestData encoding:NSUTF8StringEncoding] ?: @"";
    NSString *first = [request componentsSeparatedByString:@"\r\n"].firstObject ?: @"";
    NSArray *parts = [first componentsSeparatedByString:@" "];
    NSString *method = parts.count > 0 ? parts[0] : @"", *path = parts.count > 1 ? parts[1] : @"";
    NSInteger status = 200; id response = nil;
    if ([method isEqualToString:@"GET"] && [path isEqualToString:@"/v1/health"]) {
        NSDictionary *snapshot = self.store.snapshot;
        NSMutableDictionary *health = [@{ @"status": @"ok", @"snapshotAvailable": @(snapshot != nil), @"lastFetchedAt": snapshot[@"fetchedAt"] ?: NSNull.null } mutableCopy];
        [health addEntriesFromDictionary:self.store.status];
        NSDictionary *connection = BDConnectionState(snapshot, self.store.status, BDNowMilliseconds());
        health[@"ackMatchesSnapshot"] = connection[@"ackMatchesSnapshot"]; health[@"bandState"] = connection[@"bandState"];
        health[@"snapshotRevision"] = snapshot[@"revision"] ?: NSNull.null;
        response = health;
    } else if ([method isEqualToString:@"GET"] && [path isEqualToString:@"/v1/snapshot"]) {
        response = self.store.snapshot;
        if (!response) { status = 503; response = @{ @"error": @"snapshot_unavailable" }; }
    } else if ([method isEqualToString:@"POST"] && [path isEqualToString:@"/v1/events"]) {
        NSRange separator = BDHeaderSeparator(requestData); NSString *headers = BDHeaderText(requestData, separator);
        NSData *eventBody = headers ? BDRequestBody(requestData, headers, separator) : nil;
        NSDictionary *event = eventBody ? [NSJSONSerialization JSONObjectWithData:eventBody options:0 error:nil] : nil;
        if ([event isKindOfClass:NSDictionary.class] && [self.store recordEvent:event]) {
            if (self.eventHandler) self.eventHandler(event);
            status = 202; response = @{ @"status": @"accepted" };
        } else { status = 400; response = @{ @"error": @"invalid_event" }; }
    } else { status = 404; response = @{ @"error": @"not_found" }; }
    NSData *body = BDJSONData(response ?: @{});
    NSString *reason = status == 200 ? @"OK" : status == 202 ? @"Accepted" : status == 400 ? @"Bad Request" : status == 404 ? @"Not Found" : @"Service Unavailable";
    NSString *header = [NSString stringWithFormat:@"HTTP/1.1 %ld %@\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: %lu\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n", (long)status, reason, (unsigned long)body.length];
    NSMutableData *reply = [[header dataUsingEncoding:NSUTF8StringEncoding] mutableCopy]; [reply appendData:body];
    const uint8_t *bytes = reply.bytes; NSUInteger sent = 0;
    while (sent < reply.length) { ssize_t wrote = send(client, bytes + sent, reply.length - sent, 0); if (wrote <= 0) break; sent += (NSUInteger)wrote; }
    close(client);
}
@end

@interface BDQuotaView : NSView
@end
@implementation BDQuotaView
- (void)drawRect:(NSRect)dirtyRect {
    [NSColor.controlBackgroundColor setFill];
    [[NSBezierPath bezierPathWithRoundedRect:self.bounds xRadius:15 yRadius:15] fill];
}
- (void)viewDidChangeEffectiveAppearance { [super viewDidChangeEffectiveAppearance]; self.needsDisplay = YES; }
@end

@interface BDViewController : NSViewController
@property(nonatomic) NSTextField *syncLabel, *quotaLabel, *percentLabel, *resetLabel, *secondaryLabel;
@property(nonatomic) NSTextField *lifetimeLabel, *peakLabel, *streakLabel, *codexLabel, *bridgeLabel, *astroLabel, *bandLabel, *errorLabel;
@property(nonatomic) NSProgressIndicator *progress;
@property(nonatomic) NSButton *refreshButton;
@property(nonatomic) NSMapTable<NSTextField *, NSTextField *> *statusDots;
@property(nonatomic, copy) dispatch_block_t refreshHandler, openHandler, quitHandler;
- (void)applySnapshot:(NSDictionary *)snapshot;
- (void)setStatus:(NSString *)text label:(NSTextField *)label good:(BOOL)good;
@end

@implementation BDViewController
- (NSTextField *)label:(NSString *)text size:(CGFloat)size color:(NSColor *)color {
    NSTextField *label = [NSTextField labelWithString:text]; label.font = [NSFont systemFontOfSize:size]; label.textColor = color; return label;
}
- (NSStackView *)row:(NSArray<NSView *> *)views {
    NSStackView *row = [NSStackView stackViewWithViews:views]; row.orientation = NSUserInterfaceLayoutOrientationHorizontal; row.alignment = NSLayoutAttributeCenterY; row.spacing = 8; return row;
}
- (NSStackView *)statusRow:(NSString *)title value:(NSTextField *)detail {
    NSTextField *dot = [self label:@"●" size:12 color:NSColor.tertiaryLabelColor];
    [self.statusDots setObject:dot forKey:detail];
    NSTextField *name = [self label:title size:12 color:NSColor.labelColor];
    NSView *spacer = NSView.new; [spacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
    return [self row:@[dot, name, spacer, detail]];
}
- (void)loadView {
    self.statusDots = NSMapTable.strongToStrongObjectsMapTable;
    self.view = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 380, 560)];
    NSStackView *root = NSStackView.new; root.orientation = NSUserInterfaceLayoutOrientationVertical; root.alignment = NSLayoutAttributeLeading; root.spacing = 13; root.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:root];
    [NSLayoutConstraint activateConstraints:@[[root.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:18], [root.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-18], [root.topAnchor constraintEqualToAnchor:self.view.topAnchor constant:18], [root.bottomAnchor constraintLessThanOrEqualToAnchor:self.view.bottomAnchor constant:-18]]];

    NSTextField *title = [self label:@"Band Desk Bridge" size:17 color:NSColor.labelColor]; title.font = [NSFont boldSystemFontOfSize:17];
    NSTextField *subtitle = [self label:@"Codex 卡片 · Mac 直连" size:11 color:NSColor.secondaryLabelColor];
    NSStackView *titles = [NSStackView stackViewWithViews:@[title, subtitle]]; titles.orientation = NSUserInterfaceLayoutOrientationVertical; titles.alignment = NSLayoutAttributeLeading; titles.spacing = 2;
    self.syncLabel = [self label:@"等待同步" size:12 color:NSColor.secondaryLabelColor];
    NSView *headSpacer = NSView.new; [headSpacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
    [root addArrangedSubview:[self row:@[titles, headSpacer, self.syncLabel]]];

    BDQuotaView *quotaBox = BDQuotaView.new; quotaBox.translatesAutoresizingMaskIntoConstraints = NO;
    NSStackView *quota = NSStackView.new; quota.orientation = NSUserInterfaceLayoutOrientationVertical; quota.alignment = NSLayoutAttributeLeading; quota.spacing = 7; quota.translatesAutoresizingMaskIntoConstraints = NO; [quotaBox addSubview:quota];
    [NSLayoutConstraint activateConstraints:@[[quota.leadingAnchor constraintEqualToAnchor:quotaBox.leadingAnchor constant:13], [quota.trailingAnchor constraintEqualToAnchor:quotaBox.trailingAnchor constant:-13], [quota.topAnchor constraintEqualToAnchor:quotaBox.topAnchor constant:12], [quota.bottomAnchor constraintEqualToAnchor:quotaBox.bottomAnchor constant:-12], [quotaBox.widthAnchor constraintEqualToConstant:344]]];
    self.quotaLabel = [self label:@"本周剩余" size:11 color:NSColor.secondaryLabelColor];
    self.percentLabel = [self label:@"—%" size:42 color:NSColor.labelColor]; self.percentLabel.font = [NSFont monospacedDigitSystemFontOfSize:42 weight:NSFontWeightSemibold];
    NSStackView *quotaText = [NSStackView stackViewWithViews:@[self.quotaLabel, self.percentLabel]]; quotaText.orientation = NSUserInterfaceLayoutOrientationVertical; quotaText.alignment = NSLayoutAttributeLeading; quotaText.spacing = -3;
    self.resetLabel = [self label:@"等待更新" size:12 color:NSColor.secondaryLabelColor];
    NSView *quotaSpacer = NSView.new; [quotaSpacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal];
    [quota addArrangedSubview:[self row:@[quotaText, quotaSpacer, self.resetLabel]]];
    self.progress = NSProgressIndicator.new; self.progress.indeterminate = NO; self.progress.minValue = 0; self.progress.maxValue = 100; self.progress.doubleValue = 0; self.progress.controlSize = NSControlSizeSmall; [self.progress.widthAnchor constraintEqualToConstant:318].active = YES; [quota addArrangedSubview:self.progress];
    self.secondaryLabel = [self label:@"等待 Codex 数据" size:11 color:NSColor.secondaryLabelColor]; [quota addArrangedSubview:self.secondaryLabel]; [root addArrangedSubview:quotaBox];

    self.lifetimeLabel = [self label:@"—\n累计 Token" size:11 color:NSColor.labelColor]; self.peakLabel = [self label:@"—\n峰值 / 日" size:11 color:NSColor.labelColor]; self.streakLabel = [self label:@"—\n连续使用" size:11 color:NSColor.labelColor];
    for (NSTextField *metric in @[self.lifetimeLabel, self.peakLabel, self.streakLabel]) { metric.maximumNumberOfLines = 2; metric.alignment = NSTextAlignmentLeft; [metric.widthAnchor constraintEqualToConstant:105].active = YES; }
    [root addArrangedSubview:[self row:@[self.lifetimeLabel, self.peakLabel, self.streakLabel]]];
    NSBox *line = NSBox.new; line.boxType = NSBoxSeparator; [line.widthAnchor constraintEqualToConstant:344].active = YES; [root addArrangedSubview:line];
    NSTextField *connection = [self label:@"连接链路" size:13 color:NSColor.labelColor]; connection.font = [NSFont boldSystemFontOfSize:13]; [root addArrangedSubview:connection];
    self.codexLabel = [self label:@"等待" size:12 color:NSColor.secondaryLabelColor];
    self.bridgeLabel = [self label:@"等待" size:12 color:NSColor.secondaryLabelColor];
    self.astroLabel = [self label:@"等待" size:12 color:NSColor.secondaryLabelColor];
    self.bandLabel = [self label:@"等待" size:12 color:NSColor.secondaryLabelColor];
    [root addArrangedSubview:[self statusRow:@"Codex App Server" value:self.codexLabel]];
    [root addArrangedSubview:[self statusRow:@"本机桥" value:self.bridgeLabel]];
    [root addArrangedSubview:[self statusRow:@"AstroBox 插件" value:self.astroLabel]];
    [root addArrangedSubview:[self statusRow:@"手环确认" value:self.bandLabel]];
    self.errorLabel = [self label:@"" size:11 color:NSColor.systemOrangeColor]; self.errorLabel.maximumNumberOfLines = 3; self.errorLabel.hidden = YES; [root addArrangedSubview:self.errorLabel];
    self.refreshButton = [NSButton buttonWithTitle:@"立即刷新" target:self action:@selector(refresh:)]; self.refreshButton.bezelStyle = NSBezelStyleRounded; self.refreshButton.toolTip = @"立即刷新 Codex 数据";
    NSButton *open = [NSButton buttonWithTitle:@"打开 AstroBox" target:self action:@selector(open:)]; open.bezelStyle = NSBezelStyleRounded;
    NSButton *quit = [NSButton buttonWithTitle:@"退出" target:self action:@selector(quit:)]; quit.bezelStyle = NSBezelStyleRounded; quit.toolTip = @"退出 Band Desk Bridge";
    NSView *actionSpacer = NSView.new; [actionSpacer setContentHuggingPriority:NSLayoutPriorityDefaultLow forOrientation:NSLayoutConstraintOrientationHorizontal]; [root addArrangedSubview:[self row:@[self.refreshButton, actionSpacer, open, quit]]];
    NSTextField *fine = [self label:@"仅监听本机 127.0.0.1，不保存 Codex 账号凭据" size:10 color:NSColor.tertiaryLabelColor]; [root addArrangedSubview:fine];
}
- (void)refresh:(id)sender { if (self.refreshHandler) self.refreshHandler(); }
- (void)open:(id)sender { if (self.openHandler) self.openHandler(); }
- (void)quit:(id)sender { if (self.quitHandler) self.quitHandler(); }
- (void)setStatus:(NSString *)text label:(NSTextField *)label good:(BOOL)good {
    label.stringValue = text;
    [self.statusDots objectForKey:label].textColor = good ? NSColor.systemGreenColor : NSColor.secondaryLabelColor;
}
- (void)applySnapshot:(NSDictionary *)snapshot {
    NSDictionary *payload = snapshot[@"payload"];
    NSArray *windows = [payload[@"windows"] isKindOfClass:NSArray.class] ? payload[@"windows"] : @[];
    NSString *selectedID = payload[@"selectedWindowId"];
    NSDictionary *selected = windows.firstObject;
    for (NSDictionary *window in windows) if ([window[@"id"] isEqual:selectedID]) { selected = window; break; }
    if (!selected) return;
    double remaining = [selected[@"remainingPercent"] doubleValue];
    self.syncLabel.stringValue = [snapshot[@"expiresAt"] longLongValue] < BDNowMilliseconds() ? @"数据过期" : @"已同步";
    self.syncLabel.textColor = [snapshot[@"expiresAt"] longLongValue] < BDNowMilliseconds() ? NSColor.systemOrangeColor : NSColor.systemMintColor;
    self.quotaLabel.stringValue = [NSString stringWithFormat:@"%@剩余 · %@", selected[@"label"] ?: @"额度", BDPlanLabel(payload[@"planType"])];
    self.percentLabel.stringValue = [NSString stringWithFormat:@"%.0f%%", remaining]; self.progress.doubleValue = remaining;
    long long seconds = MAX(0, ([selected[@"resetsAt"] longLongValue] - BDNowMilliseconds()) / 1000);
    self.resetLabel.stringValue = seconds >= 86400 ? [NSString stringWithFormat:@"%lld 天 %lld 小时后重置", seconds / 86400, (seconds % 86400) / 3600] : seconds >= 3600 ? [NSString stringWithFormat:@"%lld 小时后重置", seconds / 3600] : [NSString stringWithFormat:@"%lld 分钟后重置", MAX(1, seconds / 60)];
    NSMutableArray *others = NSMutableArray.array; for (NSDictionary *window in windows) if (![window[@"id"] isEqual:selected[@"id"]]) [others addObject:[NSString stringWithFormat:@"%@ %.0f%%", window[@"label"], [window[@"remainingPercent"] doubleValue]]];
    self.secondaryLabel.stringValue = others.count ? [others componentsJoinedByString:@" · "] : @"当前额度窗口";
    NSDictionary *usage = [payload[@"usage"] isKindOfClass:NSDictionary.class] ? payload[@"usage"] : @{};
    self.lifetimeLabel.stringValue = [NSString stringWithFormat:@"%@\n累计 Token", BDCompactNumber(usage[@"lifetimeTokens"])];
    self.peakLabel.stringValue = [NSString stringWithFormat:@"%@\n峰值 / 日", BDCompactNumber(usage[@"peakDailyTokens"])];
    NSNumber *streak = [usage[@"currentStreakDays"] isKindOfClass:NSNumber.class] ? usage[@"currentStreakDays"] : nil;
    self.streakLabel.stringValue = [NSString stringWithFormat:@"%@\n连续使用", streak ? [NSString stringWithFormat:@"%@ 天", streak] : @"—"];
}
@end

@interface BDAppDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic) NSStatusItem *statusItem;
@property(nonatomic) NSPopover *popover;
@property(nonatomic) BDViewController *viewController;
@property(nonatomic) BDSnapshotStore *store;
@property(nonatomic) BDCodexClient *client;
@property(nonatomic) BDHTTPServer *server;
@property(nonatomic) NSString *sourceID, *sessionID;
@property(nonatomic) long long revision;
@property(nonatomic) BOOL refreshing;
@end

@implementation BDAppDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    NSUserDefaults *defaults = NSUserDefaults.standardUserDefaults;
    self.sourceID = [defaults stringForKey:@"sourceID"] ?: NSUUID.UUID.UUIDString; [defaults setObject:self.sourceID forKey:@"sourceID"];
    self.sessionID = NSUUID.UUID.UUIDString; self.revision = [defaults integerForKey:@"revision"];
    self.store = BDSnapshotStore.new; NSData *cached = [defaults dataForKey:@"lastSnapshot"];
    NSDictionary *snapshot = cached ? [NSJSONSerialization JSONObjectWithData:cached options:0 error:nil] : nil; if ([snapshot isKindOfClass:NSDictionary.class]) self.store.value = snapshot;
    self.client = BDCodexClient.new; self.viewController = BDViewController.new; [self.viewController loadView];
    __weak typeof(self) weakSelf = self; self.viewController.refreshHandler = ^{ [weakSelf refresh]; }; self.viewController.openHandler = ^{ [weakSelf openAstroBox]; }; self.viewController.quitHandler = ^{ [NSApp terminate:nil]; };
    if (snapshot) [self.viewController applySnapshot:snapshot];
    [self updateConnectionLabels];
    self.popover = NSPopover.new; self.popover.contentSize = NSMakeSize(380, 560); self.popover.behavior = NSPopoverBehaviorTransient; self.popover.contentViewController = self.viewController;
    self.statusItem = [NSStatusBar.systemStatusBar statusItemWithLength:NSSquareStatusItemLength]; NSStatusBarButton *button = self.statusItem.button;
    button.image = [NSImage imageWithSystemSymbolName:@"rectangle.connected.to.line.below" accessibilityDescription:@"Band Desk Bridge"]; if (!button.image) button.title = @"BD"; button.target = self; button.action = @selector(toggle:);
    self.server = BDHTTPServer.new; self.server.store = self.store; self.server.eventHandler = ^(NSDictionary *event) { dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf handleEvent:event]; }); };
    NSError *serverError = nil; if ([self.server start:&serverError]) [self.viewController setStatus:@"127.0.0.1:17373" label:self.viewController.bridgeLabel good:YES]; else { self.viewController.bridgeLabel.stringValue = @"启动失败"; self.viewController.errorLabel.stringValue = serverError.localizedDescription; self.viewController.errorLabel.hidden = NO; }
    [self refresh];
    [NSTimer scheduledTimerWithTimeInterval:120 repeats:YES block:^(__unused NSTimer *timer) { [weakSelf refresh]; }];
    [NSTimer scheduledTimerWithTimeInterval:5 repeats:YES block:^(__unused NSTimer *timer) { [weakSelf updateConnectionLabels]; }];
}
- (void)toggle:(id)sender {
    if (self.popover.shown) [self.popover performClose:nil]; else [self.popover showRelativeToRect:self.statusItem.button.bounds ofView:self.statusItem.button preferredEdge:NSRectEdgeMinY];
}
- (void)refresh {
    if (self.refreshing) return; self.refreshing = YES; self.viewController.refreshButton.enabled = NO; [self.viewController setStatus:@"正在读取" label:self.viewController.codexLabel good:NO]; self.viewController.errorLabel.hidden = YES;
    long long next = self.revision + 1; NSString *source = self.sourceID, *session = self.sessionID; __weak typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSError *error = nil; NSDictionary *snapshot = [weakSelf.client fetchSourceID:source sessionID:session revision:next error:&error];
        dispatch_async(dispatch_get_main_queue(), ^{
            typeof(self) self = weakSelf; if (!self) return;
            if (snapshot) {
                self.revision = next; [NSUserDefaults.standardUserDefaults setInteger:(NSInteger)next forKey:@"revision"];
                NSData *data = BDJSONData(snapshot); [NSUserDefaults.standardUserDefaults setObject:data forKey:@"lastSnapshot"]; [self.store update:snapshot]; [self.viewController applySnapshot:snapshot]; [self.viewController setStatus:@"正常 · 刚刚" label:self.viewController.codexLabel good:YES];
            } else {
                [self.viewController setStatus:self.store.snapshot ? @"读取失败 · 保留缓存" : @"读取失败" label:self.viewController.codexLabel good:NO]; self.viewController.errorLabel.stringValue = error.localizedDescription ?: @"Codex 数据读取失败"; self.viewController.errorLabel.hidden = NO;
            }
            self.refreshing = NO; self.viewController.refreshButton.enabled = YES;
            [self updateConnectionLabels];
        });
    });
}
- (void)openAstroBox { [NSWorkspace.sharedWorkspace openURL:[NSURL fileURLWithPath:@"/Applications/AstroBox.app"]]; }
- (void)handleEvent:(NSDictionary *)event {
    [self updateConnectionLabels];
    if ([event[@"type"] isEqual:@"refresh_request"]) [self refresh];
}
- (void)updateConnectionLabels {
    if (self.store.snapshot) [self.viewController applySnapshot:self.store.snapshot];
    NSDictionary *state = BDConnectionState(self.store.snapshot, self.store.status, BDNowMilliseconds());
    [self.viewController setStatus:state[@"pluginText"] label:self.viewController.astroLabel good:[state[@"pluginGood"] boolValue]];
    [self.viewController setStatus:state[@"bandText"] label:self.viewController.bandLabel good:[state[@"bandGood"] boolValue]];
}
@end

#ifndef BD_TESTING
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        application.activationPolicy = NSApplicationActivationPolicyAccessory;
        BDAppDelegate *delegate = BDAppDelegate.new;
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
#endif
