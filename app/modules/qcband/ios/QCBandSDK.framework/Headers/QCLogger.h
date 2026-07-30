//
//  QCLogger.h
//  QCBandSDK
//
//  Created by steve on 2023/11/23.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// 定义日志输出的宏
#define QCLog(fmt, ...) \
do { \
    if ([QCLogger isLoggingEnabled]) { \
        NSString *log = [NSString stringWithFormat:(fmt), ##__VA_ARGS__]; \
        [QCLogger logMessage:log]; \
    } \
} while(0)

// 日志开关变量
//extern BOOL static kLoggingEnabled;

@interface QCLogger : NSObject

+ (void)setLoggingEnabled:(BOOL)enabled;
+ (BOOL)isLoggingEnabled;

/// 核心日志入口
+ (void)logMessage:(NSString *)message;

/// 手动清理日志（可选）
+ (void)clearLogFile;

/// 获取日志文件路径（方便导出）
+ (NSString *)logFilePath;

@end

NS_ASSUME_NONNULL_END
