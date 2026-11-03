// Blurs what is behind a transparent macOS window, so the desktop shows through frosted rather than
// sharp. Electron has no API for this; it is the private window server call Ghostty and iTerm2 use.
// A Node-API add-on, so one build loads in any Electron version. Built by
// scripts/build-desktop-artifact.ts (stageWindowBlur) and `pnpm build:window-blur` for development.
#include <Block.h>
#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <dlfcn.h>
#include <node_api.h>
#include <objc/message.h>
#include <objc/runtime.h>
#include <stdint.h>

typedef int32_t CGSConnectionID;
extern CGSConnectionID CGSDefaultConnectionForThread(void);
extern int32_t CGSSetWindowBackgroundBlurRadius(CGSConnectionID connection, uint32_t windowNumber,
                                                uint32_t radius);

typedef CFTypeRef (*TransactionCreateFn)(CGSConnectionID connection);
typedef void (*TransactionSetCornerRadiusFn)(CFTypeRef transaction, uint32_t windowNumber,
                                            double radius);
typedef void (*TransactionCommitFn)(CFTypeRef transaction, int32_t synchronous);

static TransactionCreateFn transactionCreate;
static TransactionSetCornerRadiusFn transactionSetCornerRadius;
static TransactionCommitFn transactionCommit;

// Looked up at runtime, so a macOS without these only skips the corner fix.
static int LoadTransactionFunctions(void) {
  if (!transactionCreate) {
    transactionCreate = (TransactionCreateFn)dlsym(RTLD_DEFAULT, "SLSTransactionCreate");
    transactionSetCornerRadius =
        (TransactionSetCornerRadiusFn)dlsym(RTLD_DEFAULT, "SLSTransactionSetWindowCornerRadius");
    transactionCommit = (TransactionCommitFn)dlsym(RTLD_DEFAULT, "SLSTransactionCommit");
  }
  return transactionCreate && transactionSetCornerRadius && transactionCommit;
}

// Blurring makes the window server treat the window as a plain rectangle, so the blur and the
// window's edge lose their rounded corners while AppKit still rounds the content. This hands the
// window server AppKit's own radius again, inside `transaction`.
static void SetCornerRadiusInTransaction(CFTypeRef transaction, id window) {
  SEL cornerRadius = sel_registerName("_cornerRadius");
  if (!class_respondsToSelector(object_getClass(window), cornerRadius)) return;
  long windowNumber = ((long (*)(id, SEL))objc_msgSend)(window, sel_registerName("windowNumber"));
  if (windowNumber <= 0) return;
  double radius = ((double (*)(id, SEL))objc_msgSend)(window, cornerRadius);
  transactionSetCornerRadius(transaction, (uint32_t)windowNumber, radius);
}

static void MatchWindowCornerRadius(id window) {
  if (!LoadTransactionFunctions()) return;
  CFTypeRef transaction = transactionCreate(CGSDefaultConnectionForThread());
  if (!transaction) return;
  SetCornerRadiusInTransaction(transaction, window);
  transactionCommit(transaction, 0);
  CFRelease(transaction);
}

// AppKit rebuilds the window's corner mask whenever it turns key or main, changes appearance or
// resizes, and its next window server transaction clears the corner radius for its own mask, which
// the blur doesn't follow: the edge goes chamfered and the blur shows through at each corner. A
// separate transaction can't fix that, because AppKit's is applied with the Core Animation commit
// after it. So blurred windows are marked, and each mask change adds the radius to AppKit's own
// transaction, after its mask.
static const char kBlurredWindowKey = 0;
// _NSCGSTransaction runs its actions by order (-1, 0 or 1); 1 runs last.
static const long kLastTransactionActionOrder = 1;
static IMP originalCornerMaskChanged;

static void CornerMaskChanged(id window, SEL selector) {
  ((void (*)(id, SEL))originalCornerMaskChanged)(window, selector);
  if (!objc_getAssociatedObject(window, &kBlurredWindowKey)) return;
  Class transactionClass = objc_getClass("_NSCGSTransaction");
  SEL currentTransaction = sel_registerName("currentTransaction");
  SEL addAction = sel_registerName("addActionWithOrder:usingBlock:");
  if (!transactionClass || !class_respondsToSelector(transactionClass, addAction) ||
      !class_respondsToSelector(object_getClass((id)transactionClass), currentTransaction)) {
    MatchWindowCornerRadius(window);
    return;
  }
  id transaction = ((id (*)(id, SEL))objc_msgSend)((id)transactionClass, currentTransaction);
  if (!transaction) return;
  CFRetain(window);
  void (^setCornerRadius)(CFTypeRef) = Block_copy(^(CFTypeRef windowServerTransaction) {
    if (windowServerTransaction) SetCornerRadiusInTransaction(windowServerTransaction, window);
    CFRelease(window);
  });
  ((void (*)(id, SEL, long, id))objc_msgSend)(transaction, addAction, kLastTransactionActionOrder,
                                              (id)setCornerRadius);
  Block_release(setCornerRadius);
}

static void KeepCornersAfterMaskChanges(void) {
  static int installed;
  if (installed || !LoadTransactionFunctions()) return;
  installed = 1;
  Method cornerMaskChanged =
      class_getInstanceMethod(objc_getClass("NSWindow"), sel_registerName("_cornerMaskChanged"));
  if (cornerMaskChanged) {
    originalCornerMaskChanged = method_setImplementation(cornerMaskChanged, (IMP)CornerMaskChanged);
  }
}

// setWindowBackgroundBlurRadius(windowNumber, radius, nativeWindowHandle?) -> window server status
// (0 is success). The handle (BrowserWindow.getNativeWindowHandle) keeps the corners rounded.
static napi_value SetWindowBackgroundBlurRadius(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  uint32_t windowNumber = 0;
  uint32_t radius = 0;
  if (argc < 2 || napi_get_value_uint32(env, argv[0], &windowNumber) != napi_ok ||
      napi_get_value_uint32(env, argv[1], &radius) != napi_ok) {
    napi_throw_type_error(env, NULL, "expected (windowNumber, radius, nativeWindowHandle?)");
    return NULL;
  }
  int32_t status =
      CGSSetWindowBackgroundBlurRadius(CGSDefaultConnectionForThread(), windowNumber, radius);
  void *handle = NULL;
  size_t handleLength = 0;
  if (argc > 2 && napi_get_buffer_info(env, argv[2], &handle, &handleLength) == napi_ok &&
      handleLength >= sizeof(id)) {
    id window = ((id (*)(id, SEL))objc_msgSend)(*(id *)handle, sel_registerName("window"));
    if (window) {
      KeepCornersAfterMaskChanges();
      objc_setAssociatedObject(window, &kBlurredWindowKey, radius > 0 ? (id)kCFBooleanTrue : nil,
                               OBJC_ASSOCIATION_ASSIGN);
      MatchWindowCornerRadius(window);
    }
  }
  napi_value result;
  napi_create_int32(env, status, &result);
  return result;
}

// The window server's own blur stops getting stronger past 60 points. A Core Animation backdrop
// layer that samples what the window server draws behind the window (`windowServerAware`) blurs
// as far as asked, so the blur is a layer under the web content instead: a plain view at the
// bottom of the content view, hosting that layer with a Gaussian blur filter.
static const char kBackdropViewKey = 0;

static id Send(id target, const char *selector) {
  return ((id (*)(id, SEL))objc_msgSend)(target, sel_registerName(selector));
}

static void SetValueForKey(id target, CFTypeRef value, CFStringRef key) {
  ((void (*)(id, SEL, id, id))objc_msgSend)(target, sel_registerName("setValue:forKey:"),
                                            (id)value, (id)key);
}

static void SetBackdropBlur(id window, double radius) {
  id view = objc_getAssociatedObject(window, &kBackdropViewKey);
  if (radius <= 0) {
    if (view) {
      Send(view, "removeFromSuperview");
      objc_setAssociatedObject(window, &kBackdropViewKey, nil, OBJC_ASSOCIATION_RETAIN);
    }
    return;
  }
  if (!view) {
    id contentView = Send(window, "contentView");
    Class backdropClass = objc_getClass("CABackdropLayer");
    if (!contentView || !backdropClass) return;
    CGRect bounds = ((CGRect (*)(id, SEL))objc_msgSend)(contentView, sel_registerName("bounds"));
    view = ((id (*)(id, SEL, CGRect))objc_msgSend)(Send((id)objc_getClass("NSView"), "alloc"),
                                                    sel_registerName("initWithFrame:"), bounds);
    id layer = Send(Send((id)backdropClass, "alloc"), "init");
    SetValueForKey(layer, kCFBooleanTrue, CFSTR("windowServerAware"));
    // A layer-hosting view: the layer is set before wantsLayer, so AppKit leaves it alone.
    ((void (*)(id, SEL, id))objc_msgSend)(view, sel_registerName("setLayer:"), layer);
    ((void (*)(id, SEL, signed char))objc_msgSend)(view, sel_registerName("setWantsLayer:"), 1);
    // NSViewWidthSizable | NSViewHeightSizable.
    ((void (*)(id, SEL, unsigned long))objc_msgSend)(view, sel_registerName("setAutoresizingMask:"),
                                                     18);
    // NSWindowBelow with no sibling: under every other subview, so under the web content.
    ((void (*)(id, SEL, id, long, id))objc_msgSend)(
        contentView, sel_registerName("addSubview:positioned:relativeTo:"), view, -1, nil);
    objc_setAssociatedObject(window, &kBackdropViewKey, view, OBJC_ASSOCIATION_RETAIN);
    Send(layer, "release");
    Send(view, "release");
  }
  id filter = ((id (*)(id, SEL, id))objc_msgSend)(
      (id)objc_getClass("CAFilter"), sel_registerName("filterWithType:"), (id)CFSTR("gaussianBlur"));
  if (!filter) return;
  CFNumberRef radiusNumber = CFNumberCreate(NULL, kCFNumberDoubleType, &radius);
  SetValueForKey(filter, radiusNumber, CFSTR("inputRadius"));
  CFRelease(radiusNumber);
  // Without it the blur darkens toward the window's edges, where it samples past them.
  SetValueForKey(filter, kCFBooleanTrue, CFSTR("inputNormalizeEdges"));
  id filters = ((id (*)(id, SEL, id))objc_msgSend)((id)objc_getClass("NSArray"),
                                                   sel_registerName("arrayWithObject:"), filter);
  ((void (*)(id, SEL, id))objc_msgSend)(Send(view, "layer"), sel_registerName("setFilters:"),
                                        filters);
}

// setWindowBackdropBlur(nativeWindowHandle, radius): the backdrop layer's blur radius (0 removes it).
static napi_value SetWindowBackdropBlur(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  void *handle = NULL;
  size_t handleLength = 0;
  double radius = 0;
  if (argc < 2 || napi_get_buffer_info(env, argv[0], &handle, &handleLength) != napi_ok ||
      handleLength < sizeof(id) || napi_get_value_double(env, argv[1], &radius) != napi_ok) {
    napi_throw_type_error(env, NULL, "expected (nativeWindowHandle, radius)");
    return NULL;
  }
  id window = Send(*(id *)handle, "window");
  if (window) SetBackdropBlur(window, radius);
  return NULL;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, "setWindowBackgroundBlurRadius", NAPI_AUTO_LENGTH,
                       SetWindowBackgroundBlurRadius, NULL, &fn);
  napi_set_named_property(env, exports, "setWindowBackgroundBlurRadius", fn);
  napi_create_function(env, "setWindowBackdropBlur", NAPI_AUTO_LENGTH, SetWindowBackdropBlur, NULL,
                       &fn);
  napi_set_named_property(env, exports, "setWindowBackdropBlur", fn);
  return exports;
}
