//
//  QCOtherDataPressureModel.h
//  QCBandSDK
//
//  Created by Cursor on 2026/6/17.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface QCOtherDataPressureModel : NSObject

/// Wire / wall-clock Unix of local day 00:00 (date + secondsFromGMT), same as 0x7B protocol.
@property (nonatomic, assign) uint32_t timestamp;
@property (nonatomic, strong) NSString *date;                  // Date, format:"yyyy-MM-dd"
@property (nonatomic, assign) NSInteger interval;              // data interval (minutes)
@property (nonatomic, strong) NSArray<NSNumber *> *values;     // pressure values; empty when dataLength=0

@end

NS_ASSUME_NONNULL_END
