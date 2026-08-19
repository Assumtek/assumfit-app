//
//  SleepModel.h
//  OdmLightBle
//
//  Created by ZongBill on 15/8/14.
//  Copyright (c) 2015年 X. All rights reserved.
//

#import <Foundation/Foundation.h>


typedef NS_ENUM(NSInteger, SLEEPTYPE) {
    SLEEPTYPENONE = 0,    //无数据
    SLEEPTYPESOBER,   //清醒
    SLEEPTYPELIGHT,   //浅睡
    SLEEPTYPEDEEP,    //深睡
    SLEEPTYPEREM,    //快速眼动
    SLEEPTYPEUNWEARED //未佩戴
};

/// 0x44 睡眠详情的数据位置类型，原始值与设备协议一致。
typedef NS_ENUM(NSInteger, QCSleepDetailDataType) {
    QCSleepDetailDataTypeUnknown = 0,
    QCSleepDetailDataTypeMainSleepBegin = 1,
    QCSleepDetailDataTypeMainSleepEnd = 2,
    QCSleepDetailDataTypeOtherSleepBegin = 3,
    QCSleepDetailDataTypeOtherSleepEnd = 4,
    QCSleepDetailDataTypeSleeping = 5,
    QCSleepDetailDataTypeDefault = QCSleepDetailDataTypeSleeping
};

@interface QCSleepModel : NSObject
@property (nonatomic, assign) SLEEPTYPE type;       //睡眠类型
@property (nonatomic, strong) NSString *happenDate; //发生时间 yyyy-MM-dd HH:mm:ss
@property (nonatomic, strong) NSString *endTime;    //结束时间.
@property (nonatomic, assign) NSInteger total;      //开始时间与结束时间的时间间隔(单位：分钟)

// 0x27/0x3E 新版睡眠协议字段。
@property (nonatomic, assign) NSInteger start;           // 当次睡眠开始分钟数（从 00:00 起算）
@property (nonatomic, assign) NSInteger end;             // 当次睡眠结束分钟数（从 00:00 起算）
@property (nonatomic, copy) NSString *dataTypes;         // 逗号分隔的设备睡眠状态
@property (nonatomic, copy) NSString *dataMinutes;       // 与 dataTypes 对应的状态持续分钟数
@property (nonatomic, assign) BOOL isMidday;             // YES 表示来自 0x3E 小睡应答
@property (nonatomic, assign) NSInteger effectiveMinutes; // 有效睡眠分钟数；分段模型中为当前段时长


// 0x44 睡眠详情扩展字段。
@property (nonatomic, copy) NSString *sleepQa;                 // 设备原始睡眠质量
@property (nonatomic, assign) QCSleepDetailDataType dataType; // 当前详情在睡眠区间中的位置

+ (SLEEPTYPE)typeWithQuality:(NSInteger)qa;
+ (NSInteger)sleepQualityFromRawValue:(NSInteger)qa;
+ (QCSleepDetailDataType)sleepDataTypeFromRawValue:(NSInteger)qa;
+ (NSInteger)effectiveMinutesFromRawValue:(NSInteger)qa;
/// 兼容历史拼写；新代码请使用 effectiveMinutesFromRawValue:。
+ (NSInteger)effetiveMinutesFromRawValue:(NSInteger)qa;
+ (BOOL)isRawQAValue:(NSInteger)qa;

/// 根据 dataType 和 effectiveMinutes 还原详情的实际开始时间。
- (NSString *)realBeginTime;

/// 根据 dataType 和 effectiveMinutes 还原详情的实际结束时间。
- (NSString *)realEndTime;

/// 返回当前详情实际覆盖的分钟数。
- (NSInteger)realEffectiveMinutes;

+ (SLEEPTYPE)typeForSleepV2:(NSInteger)val;

+ (NSInteger)sleepDuration:(NSArray<QCSleepModel*>*)sleepModels;
+ (NSInteger)fallAsleepDuration:(NSArray<QCSleepModel*>*)sleepModels;
@end
