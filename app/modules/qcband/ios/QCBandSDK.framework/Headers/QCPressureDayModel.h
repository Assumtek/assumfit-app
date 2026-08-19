//
//  QCPressureDayModel.h
//  QCBandSDK
//
//  Created by Cursor on 2026/7/24.
//

#import <Foundation/Foundation.h>
#import <QCBandSDK/QCPressureSampleModel.h>

@class QCOtherDataPressureModel;

NS_ASSUME_NONNULL_BEGIN

/// One day of pressure samples. Each sample already includes absolute time.
@interface QCPressureDayModel : NSObject

/// Day string, format "yyyy-MM-dd".
@property (nonatomic, strong) NSString *date;

/// Absolute Unix seconds of local day start (00:00:00). Not the wire wall-clock timestamp.
@property (nonatomic, assign) uint32_t timestamp;

/// Sample interval in minutes (device-reported, typically 5).
@property (nonatomic, assign) NSInteger intervalMinutes;

/// Timed samples for the whole day. Index i corresponds to time = timestamp + i * intervalMinutes * 60.
/// value == 0 means no valid reading.
/// When device returns dataLength=0, SDK still expands a full-day timeline of zeros (24h / intervalMinutes).
@property (nonatomic, strong) NSArray<QCPressureSampleModel *> *samples;

/// Build a day model from a legacy raw-array model (SDK internal / migration helper).
/// Legacy.timestamp may be wire wall-clock Unix; this API converts to absolute local day start for samples.
+ (instancetype)dayModelFromLegacyPressureModel:(QCOtherDataPressureModel *)legacy;

/// Build from day fields + raw values.
/// @param timestamp Wire/protocol wall-clock Unix or absolute day start; resolved via `date` when possible.
+ (instancetype)dayModelWithDate:(NSString *)date
                       timestamp:(uint32_t)timestamp
                 intervalMinutes:(NSInteger)intervalMinutes
                          values:(NSArray<NSNumber *> *)values;

@end

NS_ASSUME_NONNULL_END
