//
//  QCEmotionItemModel.h
//  QCBandSDK
//
//  Created by Cursor on 2026/6/17.
//

#import <Foundation/Foundation.h>
#import <QCBandSDK/QCDFU_Utils.h>

NS_ASSUME_NONNULL_BEGIN

@interface QCEmotionItemModel : NSObject

@property (nonatomic, assign) NSInteger value;
@property (nonatomic, assign) QCEmotionStatus status;

@end

NS_ASSUME_NONNULL_END
