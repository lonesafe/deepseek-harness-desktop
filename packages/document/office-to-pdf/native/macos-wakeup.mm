// LibreOffice Quartz must return after consuming its importer-completion wakeup.
#import <AppKit/AppKit.h>
#import <objc/runtime.h>

namespace {
using NextEvent = NSEvent *(*)(id, SEL, NSEventMask, NSDate *, NSRunLoopMode, BOOL);
NextEvent originalNextEvent;
thread_local bool consumedYieldWakeup = false;

NSEvent *wakeAwareNextEvent(id receiver, SEL selector, NSEventMask mask, NSDate *deadline,
                          NSRunLoopMode mode, BOOL dequeue) {
    const bool matchingRead = dequeue && mask == NSEventMaskAny
        && [mode isEqualToString:NSDefaultRunLoopMode];
    if (matchingRead && consumedYieldWakeup && [deadline isEqualToDate:[NSDate distantFuture]]) {
        consumedYieldWakeup = false;
        deadline = [NSDate distantPast];
    }
    NSEvent *event = originalNextEvent(receiver, selector, mask, deadline, mode, dequeue);
    if (matchingRead && event != nil) {
        // AquaSalInstance::YieldWakeupEvent in the pinned Core revision is 20.
        consumedYieldWakeup = [event type] == NSEventTypeApplicationDefined && [event subtype] == 20;
    }
    return event;
}

void installWakeCompatibility() {
    Method method = class_getInstanceMethod([NSApplication class],
        @selector(nextEventMatchingMask:untilDate:inMode:dequeue:));
    originalNextEvent = reinterpret_cast<NextEvent>(method_setImplementation(method,
        reinterpret_cast<IMP>(&wakeAwareNextEvent)));
}
}

#ifndef DSH_OFFICE_WAKE_TEST
__attribute__((constructor)) static void initializeOfficeWakeCompatibility() {
    installWakeCompatibility();
}
#endif
