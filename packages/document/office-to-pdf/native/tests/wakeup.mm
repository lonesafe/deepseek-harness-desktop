// Exercise the Quartz wake sequence without a LibreOffice process or timing assumptions.
#define DSH_OFFICE_WAKE_TEST
#include "../macos-wakeup.mm"
#include <cassert>
#include <cstdio>
#include <vector>

@interface FixtureEvent : NSObject
@property NSEventType type;
@property short subtype;
@end
@implementation FixtureEvent
@end

namespace {
NSEvent *queuedEvent = nil;
NSDate *observedDeadline = nil;

NSEvent *fixtureNextEvent(id, SEL, NSEventMask, NSDate *deadline, NSRunLoopMode, BOOL) {
    observedDeadline = deadline;
    NSEvent *event = queuedEvent;
    queuedEvent = nil;
    return event;
}

NSEvent *event(short subtype) {
    FixtureEvent *result = [FixtureEvent new];
    result.type = NSEventTypeApplicationDefined;
    result.subtype = subtype;
    return reinterpret_cast<NSEvent *>(result);
}

NSEvent *read(NSDate *deadline, NSEventMask mask = NSEventMaskAny,
             NSRunLoopMode mode = NSDefaultRunLoopMode, BOOL dequeue = YES) {
    return wakeAwareNextEvent(nil, nullptr, mask, deadline, mode, dequeue);
}

void consumeWake() {
    consumedYieldWakeup = false;
    queuedEvent = event(20);
    NSEvent *expected = queuedEvent;
    assert(read([NSDate distantPast]) == expected);
}
}

int main() {
    @autoreleasepool {
        Method method = class_getInstanceMethod([NSApplication class],
            @selector(nextEventMatchingMask:untilDate:inMode:dequeue:));
        IMP systemImplementation = method_setImplementation(method, reinterpret_cast<IMP>(&fixtureNextEvent));
        installWakeCompatibility();
        assert(method_getImplementation(method) == reinterpret_cast<IMP>(&wakeAwareNextEvent));

        consumeWake();
        assert(read([NSDate distantPast]) == nil);
        assert(read([NSDate distantFuture]) == nil);
        assert([observedDeadline isEqualToDate:[NSDate distantPast]]);
        read([NSDate distantFuture]);
        assert([observedDeadline isEqualToDate:[NSDate distantFuture]]);

        consumeWake();
        NSDate *bounded = [NSDate dateWithTimeIntervalSinceNow:1];
        read(bounded);
        assert(observedDeadline == bounded);
        read([NSDate distantFuture]);
        assert([observedDeadline isEqualToDate:[NSDate distantPast]]);

        for (short subtype : {short(19), short(21)}) {
            consumeWake();
            queuedEvent = event(subtype);
            read([NSDate distantPast]);
            read([NSDate distantFuture]);
            assert([observedDeadline isEqualToDate:[NSDate distantFuture]]);
        }

        for (int variant : {0, 1, 2}) {
            consumedYieldWakeup = false;
            queuedEvent = event(20);
            read([NSDate distantPast], variant == 0 ? NSEventMaskKeyDown : NSEventMaskAny,
                 variant == 1 ? NSEventTrackingRunLoopMode : NSDefaultRunLoopMode, variant != 2);
            read([NSDate distantFuture]);
            assert([observedDeadline isEqualToDate:[NSDate distantFuture]]);
        }

        consumeWake();
        read([NSDate distantFuture], NSEventMaskKeyDown);
        assert([observedDeadline isEqualToDate:[NSDate distantFuture]]);
        read([NSDate distantFuture], NSEventMaskAny, NSEventTrackingRunLoopMode);
        assert([observedDeadline isEqualToDate:[NSDate distantFuture]]);
        read([NSDate distantFuture], NSEventMaskAny, NSDefaultRunLoopMode, NO);
        assert([observedDeadline isEqualToDate:[NSDate distantFuture]]);
        read([NSDate distantFuture]);
        assert([observedDeadline isEqualToDate:[NSDate distantPast]]);
        method_setImplementation(method, systemImplementation);
        std::puts("Office Quartz wake sequence: passed");
    }
}
