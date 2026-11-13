#define BD_TESTING 1
#import "../Native/main.m"

static NSDictionary *snapshot(NSString *session, NSNumber *revision) {
 return @{ @"sessionId":session,@"revision":revision,@"expiresAt":@(BDNowMilliseconds()+600000),@"payload":@{
  @"planType":@"self_serve_business_prolite",@"selectedWindowId":@"week",@"windows":@[
   @{@"id":@"week",@"label":@"本周",@"remainingPercent":@59,@"resetsAt":@(BDNowMilliseconds()+450000000)},
   @{@"id":@"short",@"label":@"5小时",@"remainingPercent":@82}],
  @"usage":@{@"lifetimeTokens":@18000000,@"peakDailyTokens":@5200000,@"currentStreakDays":@6}}};
}
static NSDictionary *ack(NSString *session, NSNumber *revision) {
 return @{@"schemaVersion":@1,@"cardId":@"codex.rate-limits",@"type":@"ack",@"sessionId":session,@"revision":revision};
}
static NSDictionary *sent(NSString *session, NSNumber *revision) {
 return @{@"kind":@"relay_status",@"status":@"sent",@"sessionId":session,@"revision":revision};
}
static NSString *state(BDSnapshotStore *store,long long now) {return BDConnectionState(store.snapshot,store.status,now)[@"bandState"];}
int main(int argc,const char *argv[]) {
 @autoreleasepool {
  NSCAssert([BDPlanLabel(@"pro") isEqual:@"Pro 20×"],@"Pro 20x tier");
  NSCAssert([BDPlanLabel(@"prolite") isEqual:@"Pro 5×"],@"Pro 5x tier");
  BDSnapshotStore *store=BDSnapshotStore.new;[store update:snapshot(@"a",@1)];
  NSCAssert([state(store,1000) isEqual:@"not_sent"],@"new snapshot awaits send");
  [store recordEvent:sent(@"a",@1) at:1000];NSCAssert([state(store,1001) isEqual:@"pending"],@"sent is not acknowledged");
  [store recordEvent:ack(@"a",@1) at:2000];[store recordEvent:sent(@"a",@1) at:16000];
  NSCAssert([state(store,16000) isEqual:@"confirmed"],@"retry must not erase ACK");
  [store update:snapshot(@"a",@2)];NSCAssert([state(store,17000) isEqual:@"not_sent"],@"old ACK cannot confirm newer data");
  [store recordEvent:sent(@"a",@2) at:18000];[store recordEvent:sent(@"a",@2) at:33000];[store recordEvent:sent(@"a",@2) at:48000];
  NSCAssert([state(store,48000) isEqual:@"timeout"],@"retries cannot reset ACK deadline");
  [store recordEvent:ack(@"wrong",@2) at:49000];[store recordEvent:ack(@"a",@1) at:49000];[store recordEvent:ack(@"a",@3) at:49000];
  NSCAssert([state(store,49000) isEqual:@"timeout"],@"wrong session/revision cannot confirm");
  [store recordEvent:ack(@"a",@2) at:50000];NSCAssert([state(store,50000) isEqual:@"confirmed"],@"late real ACK recovers");
  [store update:snapshot(@"b",@1)];[store recordEvent:ack(@"b",@1) at:51000];[store recordEvent:sent(@"b",@1) at:52000];
  NSCAssert([state(store,52000) isEqual:@"confirmed"],@"ACK before sent survives event order");
  NSCAssert((![store recordEvent:@{@"type":@"ack",@"revision":@1} at:53000]),@"malformed ACK rejected");
  [store recordEvent:@{@"kind":@"relay_status",@"status":@"no_device"} at:54000];
  NSCAssert([state(store,54000) isEqual:@"disconnected"],@"old ACK does not mean connected");
  NSCAssert([state(store,100000) isEqual:@"offline"],@"stale relay becomes offline");
  NSLog(@"Native ACK state regressions: PASS");
  [NSApplication sharedApplication];
  NSString *output=argc>1?@(argv[1]):@"/tmp/band-desk-native-qa";
  [NSFileManager.defaultManager createDirectoryAtPath:output withIntermediateDirectories:YES attributes:nil error:nil];
  for(NSString *mode in @[@"light",@"dark"]) {
   NSAppearance *appearance=[NSAppearance appearanceNamed:[mode isEqual:@"light"]?NSAppearanceNameAqua:NSAppearanceNameDarkAqua];
   BDViewController *vc=BDViewController.new;[vc loadView];vc.view.appearance=appearance;
   [vc applySnapshot:snapshot(@"qa",@1)];
   [vc setStatus:@"正常 · 刚刚" label:vc.codexLabel good:YES];
   [vc setStatus:@"127.0.0.1:17373" label:vc.bridgeLabel good:YES];
   [vc setStatus:@"已转发快照" label:vc.astroLabel good:YES];
   [vc setStatus:@"已确认最新数据" label:vc.bandLabel good:YES];
   NSWindow *window=[[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,380,560) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
   window.appearance=appearance;window.contentView=vc.view;
   [appearance performAsCurrentDrawingAppearance:^{
    vc.view.wantsLayer=YES;vc.view.layer.backgroundColor=NSColor.windowBackgroundColor.CGColor;
    [vc.view layoutSubtreeIfNeeded];[vc.view displayIfNeeded];
    NSView *quotaBox=vc.quotaLabel.superview;
    while(quotaBox && ![quotaBox isKindOfClass:BDQuotaView.class]) quotaBox=quotaBox.superview;
    NSCAssert(quotaBox,@"quota has an adaptive background");
    for(NSView *content in @[vc.quotaLabel,vc.percentLabel,vc.resetLabel,vc.progress,vc.secondaryLabel]) {
     NSRect rect=[content convertRect:content.bounds toView:quotaBox];
     NSCAssert(NSContainsRect(quotaBox.bounds,rect),@"all quota content stays inside its background");
    }
    NSBitmapImageRep *image=[vc.view bitmapImageRepForCachingDisplayInRect:vc.view.bounds];
    [vc.view cacheDisplayInRect:vc.view.bounds toBitmapImageRep:image];
    [[image representationUsingType:NSBitmapImageFileTypePNG properties:@{}] writeToFile:[output stringByAppendingPathComponent:[mode stringByAppendingString:@".png"]] atomically:YES];
   }];
  }
  NSLog(@"Native light/dark screenshots: %@",output);
 }
 return 0;
}
