//
//  QCLogger.h
//  QCBandSDK
//
//  Created by steve on 2023/11/23.
//
//  SDK 统一日志出口。集成方通过 QCSDKManager.debug 开关调试日志（默认 YES）。
//  协议明文 / 原始包落盘属 SDK 内部能力，不对外提供开关。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, QCLogLevel) {
    QCLogLevelOff = 0,      ///< 关闭全部 SDK 调试日志
    QCLogLevelError = 1,    ///< 仅错误
    QCLogLevelInfo = 2,     ///< 关键信息
    QCLogLevelDebug = 3,    ///< 常规调试（默认）
};

#define QCLogError(fmt, ...)   QCLogAtLevel(QCLogLevelError, fmt, ##__VA_ARGS__)
#define QCLogInfo(fmt, ...)    QCLogAtLevel(QCLogLevelInfo, fmt, ##__VA_ARGS__)
#define QCLogDebug(fmt, ...)   QCLogAtLevel(QCLogLevelDebug, fmt, ##__VA_ARGS__)

/// 兼容旧宏：等同 QCLogDebug
#define QCLog(fmt, ...) QCLogDebug(fmt, ##__VA_ARGS__)

// 注意：宏形参不能叫 level，否则会替换掉 ObjC 选择子里的 level:，
// 展开成 logMessage:QCLogLevelDebug: 导致编译失败。
#define QCLogAtLevel(lvl, fmt, ...) \
do { \
    if ([QCLogger shouldLogLevel:(lvl)]) { \
        NSString *_qc_log_msg_ = [NSString stringWithFormat:(fmt), ##__VA_ARGS__]; \
        [QCLogger logMessage:_qc_log_msg_ level:(lvl)]; \
    } \
} while (0)

@interface QCLogger : NSObject

/// YES → Debug 级别，NO → Off。不会打开协议级 Verbose。
+ (void)setLoggingEnabled:(BOOL)enabled;
+ (BOOL)isLoggingEnabled;

+ (BOOL)shouldLogLevel:(QCLogLevel)level;

+ (void)logMessage:(NSString *)message;
+ (void)logMessage:(NSString *)message level:(QCLogLevel)level;

+ (void)clearLogFile;
+ (NSString *)logFilePath;
+ (void)flush;

@end

NS_ASSUME_NONNULL_END
