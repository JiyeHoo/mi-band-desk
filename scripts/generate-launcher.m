// Deterministic Band 9 launcher tile; draws an original mark and manifest name.
#import <AppKit/AppKit.h>
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSDictionary *manifest = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:@"src/manifest.json"] options:0 error:nil];
    NSString *title = manifest[@"name"];
    if (!title.length) return 1;
    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL pixelsWide:192 pixelsHigh:156 bitsPerSample:8 samplesPerPixel:4 hasAlpha:YES isPlanar:NO colorSpaceName:NSDeviceRGBColorSpace bytesPerRow:768 bitsPerPixel:32];
    NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
    [NSGraphicsContext saveGraphicsState];
    [NSGraphicsContext setCurrentContext:context];
    context.shouldAntialias = YES;
    [[NSColor clearColor] setFill];
    NSRectFillUsingOperation(NSMakeRect(0, 0, 192, 156), NSCompositingOperationCopy);
    // AppKit's origin is at the bottom. The mark occupies the top 96 pixels.
    // Original robot mark: dark face, white eyes, mint shell and coral antenna.
    [[NSColor colorWithDeviceRed:34./255 green:78./255 blue:78./255 alpha:1] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(48, 60, 96, 96) xRadius:30 yRadius:30] fill];
    [[NSColor colorWithDeviceRed:113./255 green:230./255 blue:205./255 alpha:1] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(53, 74, 86, 67) xRadius:24 yRadius:24] fill];
    [[NSColor colorWithDeviceRed:8./255 green:20./255 blue:27./255 alpha:1] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(61, 83, 70, 49) xRadius:18 yRadius:18] fill];
    [[NSColor whiteColor] setFill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(73, 95, 15, 27) xRadius:7 yRadius:7] fill];
    [[NSBezierPath bezierPathWithRoundedRect:NSMakeRect(104, 95, 15, 27) xRadius:7 yRadius:7] fill];
    [[NSColor colorWithDeviceRed:255./255 green:151./255 blue:143./255 alpha:1] setFill];
    [[NSBezierPath bezierPathWithOvalInRect:NSMakeRect(91, 140, 10, 10)] fill];
    NSFont *font = [NSFont fontWithName:@"PingFangSC-Medium" size:28] ?: [NSFont systemFontOfSize:28 weight:NSFontWeightMedium];
    NSDictionary *attributes = @{NSFontAttributeName:font, NSForegroundColorAttributeName:[NSColor whiteColor]};
    NSSize size = [title sizeWithAttributes:attributes];
    if (size.width > 176) { fprintf(stderr, "Launcher label too wide\n"); return 1; }
    [title drawAtPoint:NSMakePoint((192 - size.width) / 2, 14) withAttributes:attributes];
    [context flushGraphics];
    [NSGraphicsContext restoreGraphicsState];
    NSData *png = [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    if (![png writeToFile:@"src/common/launcher-band9.png" atomically:YES]) return 1;
    printf("Generated 192x156 launcher tile, 96px mark, label=%s\n", title.UTF8String);
  }
  return 0;
}
