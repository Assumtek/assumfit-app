//
//  QCFilterModel.h
//  QCBandSDK
//
//  Created by qc on 2026/4/13.
//

#import <Foundation/Foundation.h>
#import <QCBandSDK/QCDFU_Utils.h>

NS_ASSUME_NONNULL_BEGIN

@interface QCFilterModel : NSObject

@property(nonatomic,assign) QC_FILTER_APP_TYPE appType;
@property(nonatomic,assign) BOOL isOn;

@end

NS_ASSUME_NONNULL_END
