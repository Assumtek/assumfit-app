//
//  QCHRVDayModel.h
//  QCBandSDK
//
//  Created by Cursor on 2026/7/29.
//

#import <Foundation/Foundation.h>
#import <QCBandSDK/QCHRVSampleModel.h>

@class QCHRVModel;

NS_ASSUME_NONNULL_BEGIN

/// Unified 5-minute timeline with 288 slots per day.
/// 统一的 5 分钟时间轴，每天固定 288 个槽位。
@interface QCHRVDayModel : NSObject

/// Day string, format "yyyy-MM-dd".
@property (nonatomic, strong) NSString *date;

/// Absolute Unix seconds of local day start (00:00:00).
@property (nonatomic, assign) uint32_t timestamp;

/// Timeline slot interval in minutes. Always 5 (288 slots per day).
@property (nonatomic, assign) NSInteger intervalMinutes;

/// Device-reported storage interval in minutes (e.g. 30 for DS500).
@property (nonatomic, assign) NSInteger deviceIntervalMinutes;

/// HRV samples on the 5-minute grid. Index i => time = timestamp + i * 5 * 60.
/// value == 0 means no valid reading.
@property (nonatomic, strong) NSArray<QCHRVSampleModel *> *samples;

+ (instancetype)dayModelFromLegacyHRVModel:(QCHRVModel *)legacy;

+ (instancetype)dayModelWithDate:(NSString *)date
           deviceIntervalMinutes:(NSInteger)deviceIntervalMinutes
                          values:(NSArray<NSNumber *> *)values;

@end

NS_ASSUME_NONNULL_END
