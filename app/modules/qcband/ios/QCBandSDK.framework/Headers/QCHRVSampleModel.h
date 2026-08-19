//
//  QCHRVSampleModel.h
//  QCBandSDK
//
//  Created by Cursor on 2026/7/29.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// One HRV sample with an absolute timestamp (same idea as QCPressureSampleModel).
@interface QCHRVSampleModel : NSObject

/// Absolute sample time (local calendar, derived from day start + index * interval).
@property (nonatomic, strong) NSDate *time;

/// Unix seconds for `time` (since 1970-01-01).
@property (nonatomic, assign) uint32_t unixTimestamp;

/// HRV value in milliseconds. 0 means no valid reading at this slot.
@property (nonatomic, assign) NSInteger value;

+ (instancetype)sampleWithUnixTimestamp:(uint32_t)unixTimestamp value:(NSInteger)value;

@end

NS_ASSUME_NONNULL_END
