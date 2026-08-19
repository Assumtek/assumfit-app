//
//  QCSDKCmdCreator.h
//  QCBandSDK
//
//  Created by steve on 2021/7/7.
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <QCBandSDK/OdmBleConstants.h>
#import <QCBandSDK/QCDFU_Utils.h>
#import <QCBandSDK/OdmSportPlusModels.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, QCSleepProcotolVersion) {
    QCSleepProcotolVersion1 = 0,   //睡眠协议版本1
    QCSleepProcotolVersion2,    //睡眠协议版本2
    QCSleepProcotolVersionCount,
};

@class QCSportModel;
@class QCSleepModel;
@class QCHeartRateModel;
@class QCExerciseModel;
@class QCBloodPressureModel;
@class QCSchedualHeartRateModel;
@class OdmGeneralExerciseSummaryModel;
@class OdmGeneralExerciseDetailModel;
@class QCDialParameterModel;
@class QCAlarmModel;
@class QCSimpleDialFileModel;
@class QCManualHeartRateModel;
@class QCDimingTimeInfo;
@class QCStressModel;
@class QCOtherDataPressureModel;
@class QCPressureDayModel;
@class QCPressureSampleModel;
@class QCOtherDataEmotionModel;
@class QCEmotionItemModel;
@class QCHRVModel;
@class QCHRVDayModel;
@class QCHRVSampleModel;
@class QCSedentaryModel;
@class QCFlipWristInfoModel;
@class QCFilterModel;
@interface QCSDKCmdCreator : NSObject
+ (instancetype)shareInstance;

/**
 *	@brief	Sets the device UUID.
 *	设置设备 UUID。
 *
 *	@param 	uuid 	Device identifier string, must be less than 10 characters.
 *	设备标识字符串，长度须小于 10 个字符。
 *	Note: This feature is only supported by certain devices.
 *	注意：仅部分设备支持此功能。
 *	@param 	suc 	Callback invoked when the operation succeeds.
 *	成功回调。
 *	@param 	fail 	Callback invoked when the operation fails.
 *	失败回调。
 */
+ (void)setUUID:(NSString *)uuid
        success:(void (^)(void))suc
         failed:(void (^)(void))fail;

/**
 *	@brief	End broadcast.
 *	结束广播。
 *
 *	@param 	suc 	Callback invoked when the operation succeeds.
 *	成功回调。
 *	@param 	fail 	Callback invoked when the operation fails.
 *	失败回调。
 */
+ (void)endBroadcast:(void (^)(void))suc
         failed:(void (^)(void))fail;

/**
 *	@brief	Gets the device UUID.
 *	获取设备 UUID。
 *
 *	@param 	suc 	Callback invoked when the operation succeeds, returns the UUID string.
 *	成功回调，返回 UUID 字符串。
 *	@param 	fail 	Callback invoked when the operation fails.
 *	失败回调。
 */
+ (void)getUUID:(void (^)(NSString *uuid))suc
         failed:(void (^)(void))fail;

/**
 *  Set the time of the watch
 *  设置手环的时间（传参）
 *
 *   @param suc featureList: The feature list of watch
 *          key:
 *          QCBandFeatureTemperature ==> value: @"1": YES
 *          QCBandFeatureDialMarket;==> value: @"1": YES
 *          QCBandFeatureMenstr; // 生理周期==> value: @"1": YES
 *          QCBandFeatureBloodOxygen; // 血氧==> value: @"1": YES
 *          QCBandFeatureDialCoordinate; // 支持壁纸表盘设置坐标==> value: @"1": YES
 *          QCBandFeatureBloodPressure; // 血压==> value: @"1": YES
 *          QCBandFeatureDrowsiness; // 疲劳度==> value: @"1": YES
 *          QCBandFeatureOneKeyMeasure; // 一键测量==> value: @"1": YES
 *          QCBandFeatureWeather;//天气 ==> value: @"1": YES
 *          QCBandFeatureQRCodeQQ; //绑定QQ，wechat二维码  value: @"1": YES
 *          QCBandFeatureDeviceWidth; // 宽度    ==> 预留位，暂无无数据返回
 *          QCBandFeatureDeviceHeight; // 高度   ==> 预留位，暂无无数据返回
 *          QCBandFeatureNewSleepProtocol; // 睡眠协议  value: @"1": YES
 *          QCBandFeatureMaxDial; // 最大表盘数据  ==> value: @"3"
 *          QCBandFeatureContact; //通讯录  ==>  value: @"1"
 *          QCBandFeatureMaxContacts;//最大通讯录个数 ==>  value: @"500"
 *          QCBandFeatureManualHeartRate; //手动心率  value: @"1": YES
 *          QCBandFeatureCard; // 名片功能  value: @"1": YES
 *          QCBandFeatureLocation; //定位功能  value: @"1": YES
 *          QCBandFeaturePointerDial; //指针表盘  value: @"1": YES
 *          QCBandFeatureMusic; //音乐  value: @"1": YES
 *          QCBandFeatureShowAutoBT;  value: @"1": YES
 *          QCBandFeatureEBook; //电子书  value: @"1": YES
 */
+ (void)setTime:(NSDate *)date success:(void (^)(NSDictionary *featureList))suc failed:(void (^)(void))fail;

/**
 *	@brief	Read device battery.
 *	读取设备电量。
 *
 *	@param 	suc 	Success callback. battery: power level (%); charging: whether charging.
 *	成功回调。battery：电量百分比；charging：是否正在充电。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)readBatterySuccess:(void (^)(int battery,BOOL charging))suc failed:(void (^)(void))fail;

/**
 *  绑定震动
 */
+ (void)alertBindingSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *  Set the ANCS flag.So that the device can recognize if a match option pops up
 *  设置ANCS标志, 以便设备可以识别是否弹出匹配选项
 */
+ (void)setANCSFlagSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set watch time format / user personal information.
 *	设置手环时间进制 / 用户个人信息。
 *
 *	@param 	twentyfourHourFormat 	YES = 24-hour; NO = 12-hour.
 *	YES=24 小时制；NO=12 小时制。
 *	@param 	metricSystem 	YES = metric; NO = imperial.
 *	YES=公制；NO=英制。
 *	@param 	gender 	Gender (0=Male, 1=Female).
 *	性别（0=男，1=女）。
 *	@param 	age 	Age in years.
 *	年龄（岁）。
 *	@param 	height 	Height in cm.
 *	身高（厘米）。
 *	@param 	weight 	Weight in kg.
 *	体重（千克）。
 *	@param 	sbpBase 	Systolic blood pressure base (mmHg). Reserved, default 0.
 *	收缩压基准值（mmHg）。预留，默认 0。
 *	@param 	dbpBase 	Diastolic blood pressure base (mmHg). Reserved, default 0.
 *	舒张压基准值（mmHg）。预留，默认 0。
 *	@param 	hrAlarmValue 	Heart rate alarm value (bpm). Reserved, default 0.
 *	心率报警值（bpm）。预留，默认 0。
 */
+ (void)setTimeFormatTwentyfourHourFormat:(BOOL)twentyfourHourFormat
                             metricSystem:(BOOL)metricSystem
                                   gender:(NSInteger)gender
                                      age:(NSInteger)age
                                   height:(NSInteger)height
                                   weight:(NSInteger)weight
                                  sbpBase:(NSInteger)sbpBase
                                  dbpBase:(NSInteger)dbpBase
                             hrAlarmValue:(NSInteger)hrAlarmValue
                                  success:(void (^)(BOOL, BOOL, NSInteger, NSInteger, NSInteger, NSInteger, NSInteger, NSInteger, NSInteger))success fail:(void (^)(void))fail;

/**
 *	@brief	Get watch time format / user personal information.
 *	获取手环时间进制 / 用户个人信息。
 *
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@note 	isTwentyfour: YES = 24-hour; NO = 12-hour.
 *	isTwentyfour：YES=24 小时制；NO=12 小时制。
 *	@note 	isMetricSystem: YES = metric; NO = imperial.
 *	isMetricSystem：YES=公制；NO=英制。
 *	@note 	gender: Gender (0=Male, 1=Female).
 *	gender：性别（0=男，1=女）。
 *	@note 	age: Age in years.
 *	age：年龄（岁）。
 *	@note 	height: Height in cm.
 *	height：身高（厘米）。
 *	@note 	weight: Weight in kg.
 *	weight：体重（千克）。
 *	@note 	sbpBase: Systolic BP base (mmHg). Reserved, default 0.
 *	sbpBase：收缩压基准值（mmHg）。预留，默认 0。
 *	@note 	dbpBase: Diastolic BP base (mmHg). Reserved, default 0.
 *	dbpBase：舒张压基准值（mmHg）。预留，默认 0。
 *	@note 	hrAlarmValue: Heart rate alarm value (bpm). Reserved, default 0.
 *	hrAlarmValue：心率报警值（bpm）。预留，默认 0。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getTimeFormatInfo:(nullable void (^)(BOOL isTwentyfour, BOOL isMetricSystem, NSInteger gender, NSInteger age, NSInteger height, NSInteger weight, NSInteger sbpBase, NSInteger dbpBase, NSInteger hrAlarmValue))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get the device firmware (Application) version.
 *	获取设备固件（Application）版本号。
 *
 *	@param 	success 	Success callback. Software/hardware versions use "x.x.x" format.
 *	成功回调。软硬件版本号格式均为 "x.x.x"。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getDeviceSoftAndHardVersionSuccess:(void (^)(NSString *_Nonnull, NSString *_Nonnull))success fail:(void (^)(void))fail;

/**
 *	@brief	Get received push-message filter types.
 *	获取接收推送消息的类型配置。
 *
 *	@param 	suc 	Success callback with filters array.
 *	成功回调，返回 filters 数组。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 *
 *	#### Supported push types: 0=telephone, 1=SMS, 2=QQ, 3=wechat, 4=FaceBook,
 *	5=WhatsApp, 6=twitter, 7=skype, 8=line, 9=linkedin, 10=instagram, 11=tim,
 *	12=snapchat, 13/14=reserved, 15=other.
 *	#### 支持的推送类型：0=电话，1=短信，2=QQ，3=微信，4=FaceBook，5=WhatsApp，
 *	6=twitter，7=skype，8=line，9=linkedin，10=instagram，11=tim，
 *	12=snapchat，13/14=预留，15=其他。
 *	#### Example @[@"1",@"0",...] enables incoming-call alerts.
 *	#### 示例 @[@"1",@"0",...] 表示开启来电提醒。
 */
+ (void)getFilterSuccess:(void (^)(NSArray<NSNumber *> *filters))suc failed:(void (^)(void))fail;


/**
 *	@brief	Get App notification filter switch states.
 *	获取 App 消息通知的开关状态。
 *
 *	@param 	suc 	Success callback with filter models.
 *	成功回调，返回通知过滤模型数组。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getAppNotiFilterSuccess:(void (^)(NSArray<QCFilterModel *> *_Nullable filters))suc failed:(void (^)(void))fail;
/**
 *	@brief	Set received push-message filter types.
 *	设置接收推送消息的类型配置。
 *
 *	@param 	filters 	Push filter array.
 *	推送过滤数组。
 *	@param 	suc 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 *
 *	#### Supported push types: 0=telephone, 1=SMS, 2=QQ, 3=wechat, 4=FaceBook,
 *	5=WhatsApp, 6=twitter, 7=skype, 8=line, 9=linkedin, 10=instagram, 11=tim,
 *	12=snapchat, 13/14=reserved, 15=other.
 *	#### 支持的推送类型：0=电话，1=短信，2=QQ，3=微信，4=FaceBook，5=WhatsApp，
 *	6=twitter，7=skype，8=line，9=linkedin，10=instagram，11=tim，
 *	12=snapchat，13/14=预留，15=其他。
 *	#### Example @[@"1",@"0",...] enables incoming-call alerts.
 *	#### 示例 @[@"1",@"0",...] 表示开启来电提醒。
 */
+ (void)setFilter:(NSArray *)filters success:(void (^)(void))suc failed:(void (^)(void))fail;

/**
 *	@brief	Set App notification filter switch states.
 *	设置 App 消息通知的状态开关。
 *
 *	@param 	filters 	App notification filter models.
 *	App 消息通知过滤模型数组。
 *	@param 	suc 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setAppNotiFilter:(NSArray<QCFilterModel *> * _Nullable)filters success:(void (^)(void))suc failed:(void (^)(void))fail;

/**
 *  Get the current step information (you can synchronize the latest records, the summary statistics of the day)
 *  获取当前计步信息(可以同步最新纪录,当天的汇总统计数据)
 */
+ (void)getCurrentSportSucess:(void (^)(QCSportModel *sport))suc failed:(void (^)(void))fail;

/**
 *	@brief	Get aggregated step data for a specific day.
 *	获取某天的汇总计步数据。
 *
 *	#### Deprecated approach: not recommended. Prefer detailed sport APIs and aggregate locally.
 *	#### 已不推荐使用。建议使用详细运动接口后自行汇总。
 *
 *	@param 	index 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	suc 	Success callback with the day sport model.
 *	成功回调，返回当天运动模型。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getOneDaySportBy:(NSInteger)index success:(void (^)(QCSportModel *model))suc fail:(void (^)(void))fail;

/**
 *	@brief	Get detailed exercise (step) data for a day.
 *	获取某天的详细运动（计步）数据。
 *
 *	@param 	dayIndex 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	items 	Success callback. sports: all sport models of that day.
 *	成功回调。sports：当天全部运动模型。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSportDetailDataByDay:(NSInteger)dayIndex sportDatas:(nullable void (^)(NSArray<QCSportModel *> *sports))items fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get detailed exercise data for a specified time range on a day.
 *	获取某天指定时间段的详细运动数据。
 *
 *	@param 	dayIndex 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	minuteInterval 	Minute interval represented by each index.
 *	每个索引对应的分钟间隔。
 *	@param 	beginIndex 	Start index of the time range.
 *	时间段起始索引。
 *	@param 	endIndex 	End index of the time range.
 *	时间段结束索引。
 *	@param 	items 	Success callback. sports: sport models in the range.
 *	成功回调。sports：该时间段内的运动模型。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSportDetailDataByDay:(NSInteger)dayIndex minuteInterval:(NSInteger)minuteInterval beginIndex:(NSInteger)beginIndex endIndex:(NSInteger)endIndex sportDatas:(nullable void (^)(NSArray<QCSportModel *> *sports))items fail:(nullable void (^)(void))fail;


/**
 *	@brief	Get detailed sleep data for a day.
 *	获取某天的详细睡眠数据。
 *
 *	@param 	dayIndex 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	items 	Success callback. sleeps: all sleep models of that day.
 *	成功回调。sleeps：当天全部睡眠模型。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSleepDetailDataByDay:(NSInteger)dayIndex sleepDatas:(nullable void (^)(NSArray<QCSleepModel *> *sleeps))items fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get full-day sleep data (night sleep + naps) for a day.
 *	获取某天的全天睡眠数据（夜间睡眠 + 小睡）。
 *
 *	@param 	dayIndex 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	items 	Success callback. First array: night sleep models; second array: nap models.
 *	成功回调。第一个数组：夜间睡眠模型；第二个数组：小睡模型。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getFulldaySleepDetailDataByDay:(NSInteger)dayIndex sleepDatas:(nullable void (^)(NSArray<QCSleepModel *> *_Nullable,NSArray<QCSleepModel *> *_Nullable))items fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get all sleep data from a certain day to today.
 *	获取从某天到今天的所有睡眠数据。
 *
 *	@param 	fromDayIndex 	Days from today (0=today, 1=yesterday).
 *	距今天数（0=今天，1=昨天）。
 *	@param 	items 	Returned sleep data (key: days from today, value: sleep models).
 *	返回的睡眠数据（key：距今天数，value：对应睡眠数据）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSleepDetailDataFromDay:(NSInteger)fromDayIndex sleepDatas:(nullable void (^)(NSDictionary <NSString*,NSArray<QCSleepModel*>*>*_Nonnull))items fail:(nullable void (^)(void))fail;


/**
 *	@brief	Get all full-day sleep data from a certain day to today.
 *	获取从某天到今天的所有全天睡眠数据。
 *
 *	@param 	fromDayIndex 	Days from today (0=today, 1=yesterday).
 *	距今天数（0=今天，1=昨天）。
 *	@param 	items 	Returned sleep data (key: days from today, value: sleep models).
 *	返回的睡眠数据（key：距今天数，value：对应睡眠数据）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getFulldaySleepDetailDataFromDay:(NSInteger)fromDayIndex sleepDatas:(nullable void (^)(NSDictionary <NSString*,NSArray<QCSleepModel*>*>*_Nonnull,NSDictionary <NSString*,NSArray<QCSleepModel*>*>*_Nonnull))items fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get sleep data from a certain day to today (new protocol).
 *	获取从某天到今天的所有睡眠数据（新版协议）。
 *
 *	@param 	dayIndex 	0=today, 1=yesterday, 2=the day before yesterday, ...
 *	距今天数：0=今天，1=昨天，2=前天……
 *	@param 	items 	NSDictionary: key = day-index string, value = sleep models of that day.
 *	NSDictionary：key 为距今天数的字符串（如 @"0"、@"1"），value 为对应睡眠模型。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSleepDetailDataV2ByDay:(NSInteger)dayIndex sleepDatas:(nullable void (^)(NSDictionary <NSString*,NSArray<QCSleepModel*>*>*_Nonnull))items fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get sedentary reminders.
 *	获取久坐提醒。
 *
 *	@note 	beginTime: start time, format "HH:mm".
 *	beginTime：开始时间，格式 "HH:mm"。
 *	@note 	endTime: end time, format "HH:mm".
 *	endTime：结束时间，格式 "HH:mm"。
 *	@note 	repeat: weekly cycle, Sunday→Saturday, e.g. @[@0,@1,@0,@0,@0,@0,@0] = every Monday.
 *	repeat：重复周期，周日→周六，例如 @[@0,@1,@0,@0,@0,@0,@0] 表示每周一重复。
 *	@note 	interval: reminder interval in minutes, range 1-255.
 *	interval：提醒间隔，单位：分钟，范围 1-255。
 */
+ (void)getSitLongRemindResult:(void (^)(NSString *beginTime, NSString *endTime, NSArray *repeat, NSUInteger interval))remind fail:(void (^)(void))fail;

/**
 *	@brief	Set sedentary reminders.
 *	设置久坐提醒。
 *
 *	@param 	beginTime 	Start time, format "HH:mm".
 *	开始时间，格式 "HH:mm"。
 *	@param 	endTime 	End time, format "HH:mm".
 *	结束时间，格式 "HH:mm"。
 *	@param 	repeat 	Weekly cycle, Sunday→Saturday, e.g. @[@0,@1,@0,@0,@0,@0,@0] = every Monday.
 *	重复周期，周日→周六，例如 @[@0,@1,@0,@0,@0,@0,@0] 表示每周一重复。
 *	@param 	interval 	Reminder interval in minutes, range 1-255.
 *	提醒间隔，单位：分钟，范围 1-255。
 */
+ (void)setBeginTime:(NSString *)beginTime endTime:(NSString *)endTime repeatModel:(NSArray *)repeat timeInterval:(NSUInteger)interval success:(void (^)(void))suc fail:(void (^)(void))fail;

/**
 *  Find watch
 *  查找手环
 */
+ (void)lookupDeviceSuccess:(void (^)(void))suc fail:(void (^)(void))fail;

/**
 *	@brief	Send a notification function event (0x51, AA=1~6).
 *	发送通知功能事件（0x51，AA=1~6）。
 *
 *	@param 	eventType 	Notification event type. See QCNotificationEventType.
 *	通知事件类型，参见 QCNotificationEventType。
 *	@param 	suc 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)sendNotificationEvent:(QCNotificationEventType)eventType success:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	Send a custom light notification (0x51, AA=8).
 *	发送自定义亮灯通知（0x51，AA=8）。
 *
 *	@param 	priority 	Notification priority.
 *	通知优先级。
 *	@param 	action 	Light action. See QCNotificationLightAction.
 *	亮灯动作，参见 QCNotificationLightAction。
 *	@param 	cycleCount 	Number of light cycles.
 *	亮灯循环次数。
 *	@param 	onDuration 	Light-on duration. Unit: 100ms. Range: 1~127.
 *	亮灯持续时间。单位：100ms。范围：1~127。
 *	@param 	pauseDuration 	Pause duration between cycles. Unit: 100ms.
 *	周期之间的暂停时长。单位：100ms。
 *	@param 	suc 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)sendCustomLightNotificationWithPriority:(NSInteger)priority
                                         action:(QCNotificationLightAction)action
                                     cycleCount:(NSInteger)cycleCount
                                     onDuration:(NSInteger)onDuration
                                  pauseDuration:(NSInteger)pauseDuration
                                        success:(nullable void (^)(void))suc
                                           fail:(nullable void (^)(void))fail;

/**
 *	@brief	Send a custom vibration notification (0x51, AA=9).
 *	发送自定义震动通知（0x51，AA=9）。
 *
 *	@param 	priority 	Notification priority.
 *	通知优先级。
 *	@param 	action 	Vibration action. See QCNotificationVibrationAction.
 *	震动动作，参见 QCNotificationVibrationAction。
 *	@param 	cycleCount 	Number of vibration cycles.
 *	震动循环次数。
 *	@param 	vibrateDuration 	Vibration duration. Unit: 100ms. Range: 1~127.
 *	震动持续时间。单位：100ms。范围：1~127。
 *	@param 	pauseDuration 	Pause duration between cycles. Unit: 100ms.
 *	周期之间的暂停时长。单位：100ms。
 *	@param 	suc 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)sendCustomVibrationNotificationWithPriority:(NSInteger)priority
                                             action:(QCNotificationVibrationAction)action
                                         cycleCount:(NSInteger)cycleCount
                                    vibrateDuration:(NSInteger)vibrateDuration
                                      pauseDuration:(NSInteger)pauseDuration
                                            success:(nullable void (^)(void))suc
                                               fail:(nullable void (^)(void))fail;

/**
 *  Start real-time heart rate
 *  开始实时心率
 */
+ (void)beginRealTimeHeartRateSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *  Pause real-time heart rate
 *  暂停实时心率
 */
+ (void)pauseRealTimeHeartRateSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *  Continue real-time heart rate
 *  继续实时心率
 */
+ (void)continueRealTimeHeartRateSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *  End real-time heart rate
 *  结束实时心率
 */
+ (void)endRealTimeHeartRateSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *  Start heart rate measurement
 *  开始心率测量
 */
+ (void)startHeartRateMeasuringWithSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	End heart rate measurement.
 *	结束心率测量。
 *
 *	@param 	hr 	Measured heart rate (bpm). The watch displays the result based on this value.
 *	测得的心率值（bpm）。手表根据该值显示测量结果。
 */
+ (void)endHeartRateMeasuringWithHR:(NSInteger)hr success:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *  Start blood pressure measurement
 *  开始血压测量
 */
+ (void)startBloodPressureMeasuringSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	End blood pressure measurement.
 *	结束血压测量。
 *
 *	@param 	sbp 	Systolic blood pressure (mmHg).
 *	收缩压（mmHg）。
 *	@param 	dbp 	Diastolic blood pressure (mmHg).
 *	舒张压（mmHg）。
 */
+ (void)endBloodPressureMeasuringWithSbp:(NSInteger)sbp dbp:(NSInteger)dbp success:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *  start blood oxygen
 *  开始血氧测量
 */
+ (void)startBloodOxygenMeasuringWithSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	End blood oxygen measurement.
 *	结束血氧测量。
 *
 *	@param 	soa2 	Blood oxygen (SpO2) value.
 *	血氧（SpO2）值。
 */
+ (void)endBloodOxygenMeasuringWithSoa2:(CGFloat)soa2 success:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;


/**
 *  Start one-key measurement
 *  @func 打开一键体检测量的开关
 */
+ (void)openOneKeyExaminationSwitchWithSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;
/*!
 *  @func 关闭一键体检测量的开关
 */
+ (void)closeOneKeyExaminationSwitchSuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set a drink-water reminder.
 *	设置喝水提醒。
 *
 *	@param 	index 	Reminder index/number.
 *	提醒编号。
 *	@param 	type 	Alarm type. See ALARMTYPE.
 *	闹钟类型，参见 ALARMTYPE。
 *	@param 	time 	Time, format "HH:mm".
 *	时间，格式 "HH:mm"。
 *	@param 	cycle 	Weekly cycle, Sunday→Saturday, e.g. @[@0,@1,@0,@0,@0,@0,@0] = every Monday.
 *	重复周期，周日→周六，例如 @[@0,@1,@0,@0,@0,@0,@0] 表示每周一重复。
 */
+ (void)setDrinkWaterRemindIndex:(NSUInteger)index type:(ALARMTYPE)type time:(NSString *)time cycle:(NSArray<NSNumber *> *)cycle success:(nullable void (^)(void))suc failed:(nullable void (^)(void))fail;

/**
 *	@brief	Get a drink-water reminder.
 *	获取喝水提醒。
 *
 *	@param 	index 	Reminder index/number.
 *	提醒编号。
 *	@note 	type: alarm type.
 *	type：闹钟类型。
 *	@note 	time: format "HH:mm".
 *	time：格式 "HH:mm"。
 *	@note 	cycle: weekly cycle, Sunday→Saturday, e.g. @[@0,@1,@0,@0,@0,@0,@0] = every Monday.
 *	cycle：重复周期，周日→周六，例如 @[@0,@1,@0,@0,@0,@0,@0] 表示每周一重复。
 */
+ (void)getDrinkWaterRemindWithIndex:(NSUInteger)index remind:(nullable void (^)(NSUInteger index, ALARMTYPE type, NSString *time, NSArray<NSNumber *> *cycle))remind fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get information about the wrist-flip (raise-to-wake) feature.
 *	获取翻腕亮屏功能的信息。
 *
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@note 	isOn: whether the feature is turned on.
 *	isOn：功能是否开启。
 *	@note 	flipType / leftHandWear: whether the device is worn on the left hand.
 *	flipType / leftHandWear：是否左手佩戴。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getFlipWristInfo:(nullable void (^)(BOOL isOn, NSUInteger flipType))success fail:(void (^)(void))fail;

/**
 *	@brief	Set information about the wrist-flip (raise-to-wake) feature.
 *	设置翻腕亮屏功能的信息。
 *
 *	@param 	on 	Whether the feature is enabled.
 *	功能是否开启。
 *	@param 	flipType 	Whether worn on the left hand.
 *	是否左手佩戴。
 */
+ (void)setFlipWristOn:(BOOL)on flipType:(NSUInteger)flipType success:(nullable void (^)(BOOL featureOn, NSUInteger flipType))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get Do Not Disturb feature information.
 *	获取勿扰模式功能的信息。
 *
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@note 	isOn: whether the feature is enabled.
 *	isOn：功能是否开启。
 *	@note 	begin: start time, format "HH:mm".
 *	begin：开始时间，格式 "HH:mm"。
 *	@note 	end: end time, format "HH:mm".
 *	end：结束时间，格式 "HH:mm"。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getDontDisturbInfo:(nullable void (^)(BOOL isOn, NSString *begin, NSString *end))success fail:(void (^)(void))fail;

/**
 *	@brief	Set Do Not Disturb feature information.
 *	设置勿扰模式功能的信息。
 *
 *	@param 	on 	Whether the feature is enabled.
 *	功能是否开启。
 *	@param 	begin 	Start time, format "HH:mm".
 *	开始时间，格式 "HH:mm"。
 *	@param 	end 	End time, format "HH:mm".
 *	结束时间，格式 "HH:mm"。
 */
+ (void)setDontDisturbOn:(BOOL)on beginTime:(NSString *)begin endTime:(NSString *)end success:(nullable void (^)(BOOL featureOn, NSString *begin, NSString *end))success fail:(nullable void (^)(void))fail;

/**
 *  Switch the watch to the camera interface
 *
 *  切换手表到拍照界面
 */
+ (void)switchToPhotoUISuccess:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *  Keep watch camera interface
 *
 *  保持手表拍照界面
 */
+ (void)holdPhotoUISuccess:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *  Stop the lower computer (watch) to take pictures
 *
 *  停止手表拍照
 */
+ (void)stopTakingPhotoSuccess:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *  Hard restart the watch
 *
 *  硬重启手环
 */
+ (void)resetBandHardlySuccess:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get device MAC address.
 *	获取设备 Mac 地址。
 *
 *	@param 	success 	Success callback. MAC format: "AA:BB:CC:DD:EE:FF".
 *	成功回调。Mac 地址格式："AA:BB:CC:DD:EE:FF"。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getDeviceMacAddressSuccess:(nullable void (^)(NSString *_Nullable macAddress))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get scheduled blood-pressure measurement configuration.
 *	获取定时血压测量功能的信息。
 *
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@note 	featureOn: YES=ON, NO=OFF.
 *	featureOn：YES=开启，NO=关闭。
 *	@note 	beginTime: start time, format "HH:mm".
 *	beginTime：开始时间，格式 "HH:mm"。
 *	@note 	endTime: end time, format "HH:mm".
 *	endTime：结束时间，格式 "HH:mm"。
 *	@note 	minuteInterval: interval in minutes.
 *	minuteInterval：间隔，单位：分钟。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSchedualBPInfo:(nullable void (^)(BOOL featureOn, NSString *beginTime, NSString *endTime, NSInteger minuteInterval))success fail:(void (^)(void))fail;

/**
 *	@brief	Set scheduled blood-oxygen measurement switch.
 *	设置定时血氧测量功能开关。
 *
 *	@param 	featureOn 	YES=ON, NO=OFF.
 *	YES=开启，NO=关闭。
 */

+ (void)setSchedualBOInfoOn:(BOOL)featureOn success:(nullable void (^)(BOOL featureOn))success fail:(void (^)(void))fail;

/**
 *	@brief	Get scheduled blood-oxygen measurement switch.
 *	获取定时血氧测量功能开关。
 *
 *	@param 	success 	Success callback. featureOn: YES=ON, NO=OFF.
 *	成功回调。featureOn：YES=开启，NO=关闭。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */

+ (void)getSchedualBOInfoSuccess:(nullable void (^)(BOOL featureOn))success fail:(void (^)(void))fail;

/**
 *	@brief	Set scheduled blood-pressure measurement configuration.
 *	设置定时血压测量功能的信息。
 *
 *	@param 	featureOn 	YES=ON, NO=OFF.
 *	YES=开启，NO=关闭。
 *	@param 	beginTime 	Start time, format "HH:mm".
 *	开始时间，格式 "HH:mm"。
 *	@param 	endTime 	End time, format "HH:mm".
 *	结束时间，格式 "HH:mm"。
 *	@param 	minuteInterval 	Interval in minutes.
 *	间隔，单位：分钟。
 */
+ (void)setSchedualBPInfoOn:(BOOL)featureOn beginTime:(NSString *)beginTime endTime:(NSString *)endTime minuteInterval:(NSInteger)minuteInterval success:(nullable void (^)(BOOL featureOn, NSString *beginTime, NSString *endTime, NSInteger minuteInterval))success fail:(void (^)(void))fail;

/**
 *	@brief	Get scheduled blood-pressure history.
 *	获取定时血压测量的历史数据。
 *
 *	@param 	userAge 	User age in years.
 *	用户年龄（岁）。
 *	@param 	success 	Success callback with blood-pressure data array.
 *	成功回调，返回血压数据数组。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSchedualBPHistoryDataWithUserAge:(NSInteger)userAge success:(nullable void (^)(NSArray<QCBloodPressureModel *> *data))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get scheduled blood-pressure history.
 *	获取定时血压测量的历史数据。
 *
 *	@param 	success 	Success callback with blood-pressure data array.
 *	成功回调，返回血压数据数组。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSchedualBPHistoryDataWithSuccess:(nullable void (^)(NSArray<QCBloodPressureModel *> *data))success fail:(nullable void (^)(void))fail;

/**
 *  Reset the watch to factory settings
 *
 *  重置手环到出厂设置状态, 慎用
 */
+ (void)resetBandToFacotrySuccess:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get workout history data.
 *	获取锻炼历史数据。
 *
 *	@param 	lastUnixSeconds 	Unix timestamp of the last known exercise record (seconds since 1970-01-01 00:00:00).
 *	上次锻炼数据发生时间的 Unix 时间戳（自 1970-01-01 00:00:00 起的秒数）。
 *	@note 	success: motion record model array.
 *	success：运动记录模型数组。
 */
+ (void)getExerciseDataWithLastUnixSeconds:(NSUInteger)lastUnixSeconds getData:(nullable void (^)(NSArray<QCExerciseModel *> *models))getData fail:(nullable void (^)(void))fail;


/**
 *	@brief	Get manual blood-pressure history.
 *	获取手动血压测量的历史数据。
 *
 *	@param 	lastUnixSeconds 	Unix timestamp of the last known record (seconds since 1970-01-01 00:00:00).
 *	上次记录发生时间的 Unix 时间戳（自 1970-01-01 00:00:00 起的秒数）。
 *	@note 	success: blood-pressure model array.
 *	success：血压模型数组。
 */
+ (void)getManualBloodPressureDataWithLastUnixSeconds:(NSUInteger)lastUnixSeconds success:(nullable void (^)(NSArray<QCBloodPressureModel *> *data))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get scheduled heart-rate history by dates.
 *	按日期获取定时心率历史数据。
 *
 *	@param 	dates 	Date list to query.
 *	需要查询的日期列表。
 *	@note 	success: scheduled heart-rate model array.
 *	success：定时心率模型数组。
 */
+ (void)getSchedualHeartRateDataWithDates:(NSArray<NSDate *> *)dates success:(nullable void (^)(NSArray<QCSchedualHeartRateModel *> *models))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get scheduled heart-rate history by day indexes.
 *	按天数索引获取定时心率历史数据。
 *
 *	@param 	dayIndexs 	Day indexes (0=today, 1=yesterday, 2=the day before yesterday, ...).
 *	天数索引（0=今天，1=昨天，2=前天……）。
 *	@note 	success: scheduled heart-rate model array.
 *	success：定时心率模型数组。
 */
+ (void)getSchedualHeartRateDataWithDayIndexs:(NSArray<NSNumber*> *)dayIndexs success:(void (^)(NSArray<QCSchedualHeartRateModel *> *_Nonnull))success fail:(void (^)(void))fail;

/**
 *	@brief	Get manual heart-rate data.
 *	获取手动心率数据。
 *
 *	@param 	dayIndex 	Day index (0=today, 1=yesterday, 2=the day before yesterday, ...).
 *	天数索引（0=今天，1=昨天，2=前天……）。
 *	@param 	finished 	Completion callback with manual heart-rate models and error.
 *	完成回调，返回手动心率模型数组及错误信息。
 */
+ (void)getManualHeartRateDataByDayIndex:(NSInteger)dayIndex finished:(void (^)(NSArray <QCManualHeartRateModel *>* _Nullable, NSError * _Nullable))finished;

/**
 *	@brief	Get scheduled heart-rate status (with current-state hint).
 *	获取定时心率功能开关状态（带当前状态参考值）。
 *
 *	@param 	enable 	Current known state hint. YES=enabled, NO=disabled.
 *	当前已知状态参考值。YES=开启，NO=关闭。
 */
+ (void)getSchedualHeartRateStatusWithCurrentState:(BOOL)enable success:(nullable void (^)(BOOL enable))success fail:(nullable void (^)(void))fail;

/**
 *  Information on setting the timed heart rate function
 *
 *  获取定时心率功能的信息
 *
 */
+ (void)getSchedualHeartRateStatusWithSuccess:(nullable void (^)(BOOL enable))success fail:(nullable void (^)(void))fail;

/**
 *  Get the on/off status and time interval of the scheduled heart rate function (only supported by some watches)
 *
 *  获取定时心率功能的开关状态以及时间间隔(仅部分手表支持)
 *
 */
+ (void)getSchedualHeartRateStatusAndIntervalWithSuccess:(nullable void (^)(BOOL enable,NSInteger interval))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set scheduled heart-rate switch.
 *	设置定时心率功能开关。
 *
 *	@param 	enable 	YES=enabled, NO=disabled.
 *	YES=开启，NO=关闭。
 *	@param 	success 	Success callback. enable: whether enabled after setting.
 *	成功回调。enable：设置后是否开启。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setSchedualHeartRateStatus:(BOOL)enable success:(nullable void (^)(BOOL enable))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set scheduled heart-rate switch and interval (some watches only).
 *	设置定时心率功能开关及时间间隔（仅部分手表支持）。
 *
 *	@param 	enable 	YES=enabled, NO=disabled.
 *	YES=开启，NO=关闭。
 *	@param 	interval 	Scheduled heart-rate interval in minutes.
 *	定时心率间隔，单位：分钟。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setSchedualHeartRateStatus:(BOOL)enable timeInterval:(NSInteger)interval success:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get weather-forecast feature status.
 *	获取天气预报功能的信息。
 *
 *	@param 	enable 	Current known enable hint. YES=enabled, NO=disabled.
 *	当前已知开关参考值。YES=开启，NO=关闭。
 *	@param 	temperatureUsingCelsius 	Current known unit hint. YES=Celsius, NO=Fahrenheit.
 *	当前已知温度单位参考值。YES=摄氏度，NO=华氏度。
 *	@param 	success 	Success callback: (enable, usingCelsius).
 *	成功回调：（是否开启，是否使用摄氏度）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getWeatherForecastStatusWithCurrentState:(BOOL)enable temperatureUsingCelsius:(BOOL)temperatureUsingCelsius success:(nullable void (^)(BOOL enable, BOOL usingCelsius))success fail:(nullable void (^)(void))fail;
/**
 *  设置天气预报功能的信息
 *  @param enable  天气预报功能是否开启. YES: 开启; NO: 关闭
 *  @param success  usingCelsius 是否使用摄氏度. YES: 是; NO: 否, 使用华氏温度
 */
+ (void)setWeatherForecastStatus:(BOOL)enable temperatureUsingCelsius:(BOOL)temperatureUsingCelsius success:(nullable void (^)(BOOL enable, BOOL usingCelsius))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Send weather-forecast content to the watch.
 *	发送天气预报内容到手环。
 *
 *	@param 	contents 	Array of dictionaries:
 *	[{"time": date timestamp (adjust to current time zone),
 *	"type": weather type,
 *	"low-temp": min temperature,
 *	"high-temp": max temperature,
 *	"humidity": humidity,
 *	"needUmbrella": whether an umbrella is needed}]
 *	字典数组：
 *	[{"time"：日期时间戳（需按当前时区调整），
 *	"type"：天气类型，
 *	"low-temp"：最低温，
 *	"high-temp"：最高温，
 *	"humidity"：湿度，
 *	"needUmbrella"：是否需要带伞}]
 *	@note 	weather type: 0=unknown, 1=sunny, 2=partly cloudy, 3=rain, 4=snow, 5=smog, 6=thunderbolt.
 *	天气类型：0=未知，1=晴，2=多云，3=雨，4=雪，5=雾霾，6=雷电。
 */
+ (void)sendWeatherContents:(NSArray<NSDictionary *> *)contents success:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get device brightness level.
 *	获取设备亮度等级。
 *
 *	@param 	lightLevel 	Current brightness hint passed to the command (1-10 => 10%-100%). Use the device's known level when available.
 *	传给指令的当前亮度参考值（1-10 => 10%-100%）。有已知亮度时请传入。
 *	@param 	success 	Success callback. lightLevel: brightness level 1-10 => 10%-100%.
 *	成功回调。lightLevel：亮度等级 1-10 => 10%-100%。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getDeviceLightLevelWithCurrentLevel:(NSInteger)lightLevel success:(nullable void (^)(NSInteger lightLevel))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set device brightness level.
 *	设置设备亮度等级。
 *
 *	@param 	lightLevel 	Brightness level, 1-10 => 10%-100%.
 *	亮度等级，1-10 => 10%-100%。
 */
+ (void)setDeviceLightLevel:(NSInteger)lightLevel success:(nullable void (^)(NSInteger lightLevel))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get screen orientation / wear-hand info.
 *	获取屏幕方向与佩戴手信息。
 *
 *	@param 	portraitOrientation 	Known portrait hint. YES=portrait, NO=landscape.
 *	当前已知竖屏参考值。YES=竖屏，NO=横屏。
 *	@param 	leftHandWear 	Known left-hand hint (effective in landscape).
 *	当前已知左手佩戴参考值（横屏时生效）。
 *	@param 	success 	Success callback: (portrait, leftHandWear).
 *	成功回调：（是否竖屏，是否左手佩戴）。
 */
+ (void)getScreenOrientationInfoWithPortrait:(BOOL)portraitOrientation
                                leftHandWear:(BOOL)leftHandWear
                                     success:(nullable void (^)(BOOL portraitOrientation, BOOL leftHandWear))success
                                        fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set screen orientation / wear-hand info.
 *	设置屏幕方向与佩戴手信息。
 *
 *	@param 	portraitOrientation 	YES=portrait, NO=landscape.
 *	YES=竖屏，NO=横屏。
 *	@param 	leftHandWear 	YES=left hand, NO=right hand (effective in landscape).
 *	YES=左手，NO=右手（横屏时生效）。
 */
+ (void)setScreenOrientationInfoWithPortrait:(BOOL)portraitOrientation
                                leftHandWear:(BOOL)leftHandWear
                                     success:(nullable void (^)(BOOL portraitOrientation, BOOL leftHandWear))success
                                        fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get whether raise-to-wake shows the clock homepage.
 *	获取抬腕亮屏时是否显示钟表界面。
 *
 *	@param 	showing 	Known state hint.
 *	当前已知状态参考值。
 */
+ (void)getScreenHomePageShowingClockWithCurrentState:(BOOL)showing
                                              success:(nullable void (^)(BOOL showingClockOnHomePage))success
                                                 fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set whether raise-to-wake shows the clock homepage.
 *	设置抬腕亮屏时是否显示钟表界面。
 *
 *	@param 	showing 	YES to show clock UI on raise-to-wake.
 *	YES=抬腕显示钟表界面。
 */
+ (void)setScreenHomePageShowingClock:(BOOL)showing
                              success:(nullable void (^)(BOOL showingClockOnHomePage))success
                                 fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get homepage style.
 *	获取首页样式。
 *
 *	@param 	currentStyle 	Known style hint. Common values: 1 / 2.
 *	当前已知样式参考值。常见取值：1 / 2。
 */
+ (void)getScreenHomePageStyleWithCurrentStyle:(NSInteger)currentStyle
                                       success:(nullable void (^)(NSInteger homePageStyle))success
                                          fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set homepage style.
 *	设置首页样式。
 *
 *	@param 	style 	Homepage style. Common values: 1 / 2.
 *	首页样式。常见取值：1 / 2。
 */
+ (void)setScreenHomePageStyle:(NSInteger)style
                       success:(nullable void (^)(NSInteger homePageStyle))success
                          fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get music-control switch status.
 *	获取音乐控制开关状态。
 *
 *	@param 	enable 	Known state hint.
 *	当前已知状态参考值。
 *	@param 	success 	Success callback. enable: YES=on, NO=off.
 *	成功回调。enable：YES=开启，NO=关闭。
 */
+ (void)getMusicControlStatusWithCurrentState:(BOOL)enable
                                      success:(nullable void (^)(BOOL enable))success
                                         fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set music-control switch status.
 *	设置音乐控制开关状态。
 *
 *	@param 	enable 	YES to enable music control, NO to disable.
 *	YES=开启音乐控制，NO=关闭。
 */
+ (void)setMusicControlStatus:(BOOL)enable
                      success:(nullable void (^)(BOOL enable))success
                         fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get AGPS switch status.
 *	获取 AGPS 开关状态。
 *
 *	@param 	enable 	Known state hint.
 *	当前已知状态参考值。
 */
+ (void)getAGPSStatusWithCurrentState:(BOOL)enable
                              success:(nullable void (^)(BOOL enable))success
                                 fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set AGPS switch status.
 *	设置 AGPS 开关状态。
 *
 *	@param 	enable 	YES to enable AGPS, NO to disable.
 *	YES=开启 AGPS，NO=关闭。
 */
+ (void)setAGPSStatus:(BOOL)enable
              success:(nullable void (^)(BOOL enable))success
                 fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get intelligent (PXP) alarm delay info.
 *	获取智能报警（防丢/靠近）延迟信息。
 *
 *	@param 	success 	Success callback: (featureOn, delaySeconds).
 *	成功回调：（是否开启，延迟秒数）。
 */
+ (void)getPxpAlarmDelay:(nullable void (^)(BOOL featureOn, NSInteger delaySeconds))success
                    fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set intelligent (PXP) alarm delay info.
 *	设置智能报警（防丢/靠近）延迟信息。
 *
 *	@param 	on 	YES to enable the feature.
 *	YES=开启功能。
 *	@param 	delaySeconds 	Delay check time in seconds (0～255).
 *	延迟检查时间，单位：秒（0～255）。
 */
+ (void)setPxpAlarmDelay:(BOOL)on
            delaySeconds:(NSInteger)delaySeconds
                 success:(nullable void (^)(BOOL featureOn, NSInteger realDelaySeconds))success
                    fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get extended device feature configuration dictionary.
 *	获取扩展设备能力配置字典。
 */
+ (void)getDeviceFeatureConfigSuccess:(nullable void (^)(NSDictionary *featureList))success
                                 fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get resource types for UI pages (standby / boot / shutdown).
 *	获取各 UI 界面（待机 / 开机 / 关机）的资源类型。
 *
 *	@param 	uiTypes 	UI type array. See ODM_RES_UIType.
 *	UI 类型数组，参见 ODM_RES_UIType。
 *	@param 	success 	Success callback with resource type array. See ODM_RES_ResourceType.
 *	成功回调，返回资源类型数组，参见 ODM_RES_ResourceType。
 */
+ (void)getResourceWithUITypes:(NSArray<NSNumber *> *)uiTypes
                       success:(nullable void (^)(NSArray<NSNumber *> *resourceTypes))success
                          fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get/set watch screen-on duration & homepage parameters.
 *	获取/设置手环亮屏时长 & 用户首页参数。
 *
 *	@param 	opType 	0x01=read, 0x02=write, 0x03=restore homepage picture to default
 *	(BBCCDDEE invalid when AA=0x03).
 *	0x01=读，0x02=写，0x03=首页图片恢复默认（AA=0x03 时 BBCCDDEE 无效）。
 *	@param 	lightingSeconds 	Screen-on time in seconds. Legal range: 4~10.
 *	亮屏时长，单位：秒。合法范围：4~10。
 *	@param 	homePageType 	Homepage display type (0=invalid, 1=steps, 2=calories, 3=weather, 4=heart rate).
 *	首页可选显示类型（0=无效，1=步数，2=卡路里，3=天气，4=心率）。
 *	@param 	transparency 	Mask transparency 0~100 (0=opaque/base hidden, 100=fully transparent/base shown).
 *	首页遮罩透明度 0~100（0=不透明/不显示底图，100=全透明/显示底图）。
 *	@param 	pictureType 	0=default homepage picture, 1=user-configured (read-only; invalid when writing).
 *	0=默认首页图片，1=用户配置图片（仅读取有效，写入时无效）。
 */
+ (void)setHomePageScreenOpType:(NSInteger)opType lightingSeconds:(NSInteger)lightingSeconds homePageType:(NSInteger)homePageType transparency:(NSInteger)transparency pictureType:(NSInteger)pictureType success:(nullable void (^)(NSInteger lightingSeconds, NSInteger homePageType, NSInteger transparency, NSInteger pictureType))suc fail:(nullable void (^)(void))fail;


/**
 *	@brief	Get/set watch screen-on duration & homepage parameters via model.
 *	通过模型获取/设置手环亮屏时长 & 用户首页参数。
 *
 *	@param 	opType 	0x01=read, 0x02=write, 0x03=restore homepage picture to default.
 *	0x01=读，0x02=写，0x03=首页图片恢复默认。
 *	@param 	info 	Feature information model.
 *	功能信息模型。
 */
+ (void)setHomePageScreenOpType:(NSInteger)opType info:(nullable QCDimingTimeInfo*)info success:(nullable void (^)(QCDimingTimeInfo*))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set watch screen-on duration.
 *	设置手环亮屏时长。
 *
 *	@param 	seconds 	Screen-on time in seconds. Legal range: 4~10.
 *	亮屏时长，单位：秒。合法范围：4~10。
 */
+ (void)setLightingSeconds:(NSInteger)seconds success:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;;

/**
 *	@brief	Get watch screen-on duration.
 *	获取亮屏时长信息。
 *
 *	@param 	suc 	Success callback. lightingSeconds: screen-on time in seconds (4~10).
 *	成功回调。lightingSeconds：亮屏时长，单位：秒（4~10）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getLightingSecondsWithSuccess:(nullable void (^)(NSInteger seconds))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get Sport+ (V2) summary data after the specified timestamp.
 *	根据指定时间戳，获取该时间戳之后的运动+（V2）概要数据。
 *
 *	@param 	timestamp 	Unix timestamp.
 *	Unix 时间戳。
 *	@param 	finished 	Completion callback. spSummary: Sport+ summary array.
 *	完成回调。spSummary：运动+概要信息数组。
 */
+ (void)getSportPlusSummaryFromTimestamp:(NSTimeInterval)timestamp finished:(nullable void (^)(NSArray *_Nullable spSummary, NSError *_Nullable error))finished;

/**
 *	@brief	Get Sport+ (V2) detail data for a given summary.
 *	根据指定运动+（V2）概要获取详情数据。
 *
 *	@param 	summary 	Sport+ summary model previously fetched from the device.
 *	此前从设备获取的运动+概要模型。
 *	@param 	finished 	Completion callback with updated summary, detail model, and error.
 *	完成回调，返回更新后的概要、详情模型以及错误信息。
 */
+ (void)getSportPlusDetailsWithSummary:(OdmGeneralExerciseSummaryModel *)summary finished:(nullable void (^)(OdmGeneralExerciseSummaryModel *_Nullable summary, OdmGeneralExerciseDetailModel *_Nullable detail, NSError *_Nullable error))finished;

/**
 *  Get file requirements file list
 *
 *  获取文件需求文件列表
 */
+ (void)getNeededFileListFinished:(nullable void (^)(NSArray<NSString *> *_Nullable fileList, NSError *_Nullable error))finished;

/**
 *	@brief	Get user target information.
 *	获取用户目标信息。
 *
 *	@param 	suc 	Success callback.
 *	成功回调。
 *	@note 	stepTarget: step target.
 *	stepTarget：步数目标。
 *	@note 	calorieTarget: calorie goal, unit: cal.
 *	calorieTarget：卡路里目标，单位：卡。
 *	@note 	distanceTarget: distance target, unit: meter.
 *	distanceTarget：距离目标，单位：米。
 *	@note 	sportDuration: exercise duration target in minutes (reserved, default 0).
 *	sportDuration：运动时长目标，单位：分钟（预留，默认 0）。
 *	@note 	sleepDuration: sleep duration target in minutes (reserved, default 0).
 *	sleepDuration：睡眠时长目标，单位：分钟（预留，默认 0）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getStepTargetInfoWithSuccess:(nullable void (^)(NSInteger stepTarget,NSInteger calorieTarget,NSInteger distanceTarget,NSInteger sportDuration,NSInteger sleepDuration))suc fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set user target information.
 *	设置用户目标信息。
 *
 *	@param 	stepTarget 	Step target.
 *	步数目标。
 *	@param 	calorieTarget 	Calorie goal, unit: calories.
 *	卡路里目标，单位：卡。
 *	@param 	distanceTarget 	Distance target, unit: meters.
 *	距离目标，单位：米。
 *	@param 	sportDuration 	Exercise duration target in minutes (reserved, default 0).
 *	运动时长目标，单位：分钟（预留，默认 0）。
 *	@param 	sleepDuration 	Sleep duration target in minutes (reserved, default 0).
 *	睡眠时长目标，单位：分钟（预留，默认 0）。
 */
+ (void)setStepTarget:(NSInteger)stepTarget calorieTarget:(NSInteger)calorieTarget distanceTarget:(NSInteger)distanceTarget sportDurationTarget:(NSInteger)sportDuration sleepDurationTarget:(NSInteger)sleepDuration success:(nullable void (^)(void))suc fail:(nullable void (^)(void))fail;

/**
 * Get a list of dial files
 *
 * 获取表盘文件列表
*/
+ (void)listDialFileFinished:(nullable void (^)(NSArray <QCSimpleDialFileModel *>*_Nullable dialFiles, NSError *_Nullable error))finished;

/**
 *	@brief	Delete a watch-face file.
 *	删除表盘文件。
 *
 *	@param 	fileName 	Watch-face file name.
 *	表盘文件名。
 *	@param 	force 	Default NO. YES is for debugging only; use with caution.
 *	默认 NO。YES 仅用于调试，请谨慎使用。
 */
+ (void)deleteDialFileName:(NSString *)fileName force:(BOOL)force finished:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Delete a watch-face file.
 *	删除表盘文件。
 *
 *	@param 	fileName 	Watch-face file name.
 *	表盘文件名。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)deleteDialFileName:(NSString *)fileName finished:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Get scheduled body-temperature history for a day.
 *	获取某天的定时体温历史数据。
 *
 *	@param 	dayIndex 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	finished 	Completion callback with temperature list and error.
 *	完成回调，返回体温列表及错误信息。
 */
+ (void)getSchedualTemperatureDataByDayIndex:(NSInteger)dayIndex finished:(nullable void (^)(NSArray *_Nullable temperatureList, NSError *_Nullable error))finished;

/**
 *	@brief	Get manual body-temperature history for a day.
 *	获取某天的手动体温历史数据。
 *
 *	@param 	dayIndex 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	finished 	Completion callback with temperature list and error.
 *	完成回调，返回体温列表及错误信息。
 */
+ (void)getManualTemperatureDataByDayIndex:(NSInteger)dayIndex finished:(nullable void (^)(NSArray *_Nullable temperatureList, NSError *_Nullable error))finished;

/**
 *	@brief	Get blood-oxygen history for a day.
 *	获取某天的血氧历史数据。
 *
 *	@param 	dayIndex 	Day index from today (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	finished 	Completion callback with blood-oxygen list and error.
 *	完成回调，返回血氧列表及错误信息。
 */
+ (void)getBloodOxygenDataByDayIndex:(NSInteger)dayIndex finished:(void (^)(NSArray * _Nullable, NSError * _Nullable))finished;

/**
 *	@brief	Get custom dial layout parameters (time / date / value positions).
 *	获取自定义表盘布局参数（时间 / 日期 / 数值位置）。
 *
 *	@param 	finished 	Completion callback with time, date, value models and error.
 *	完成回调，返回时间、日期、数值模型及错误信息。
 */
+ (void)getDailParameterWithFinished:(void (^)(QCDialParameterModel * _Nullable time, QCDialParameterModel * _Nullable date, QCDialParameterModel * _Nullable value, NSError * _Nullable))finished;

/**
 *	@brief	Set custom dial layout parameters (time / date / value positions).
 *	设置自定义表盘布局参数（时间 / 日期 / 数值位置）。
 *
 *	@param 	time 	Time display parameter model. Pass nil to leave unchanged when supported.
 *	时间显示参数模型。在支持的情况下传 nil 表示保持不变。
 *	@param 	date 	Date display parameter model. Pass nil to leave unchanged when supported.
 *	日期显示参数模型。在支持的情况下传 nil 表示保持不变。
 *	@param 	value 	Value display parameter model. Pass nil to leave unchanged when supported.
 *	数值显示参数模型。在支持的情况下传 nil 表示保持不变。
 *	@param 	finished 	Completion callback with the applied models and error.
 *	完成回调，返回已应用的模型及错误信息。
 */
+ (void)setDailParameter:(QCDialParameterModel * _Nullable)time date:(QCDialParameterModel * _Nullable)date value:(QCDialParameterModel * _Nullable)value finished:(void (^)(QCDialParameterModel * _Nullable time, QCDialParameterModel * _Nullable date, QCDialParameterModel * _Nullable value, NSError * _Nullable))finished;

/**
 *	@brief	Get all alarms configured on the band/watch.
 *	获取手环/手表上已配置的全部闹钟。
 *
 *	@param 	finished 	Completion callback with alarm models and error.
 *	完成回调，返回闹钟模型列表及错误信息。
 */
+ (void)getBandAlarmsWithFinish:(void(^)(NSArray <QCAlarmModel*>* _Nullable,NSError * _Nullable))finished;

/**
 *	@brief	Set alarms on the band/watch.
 *	设置手环/手表闹钟。
 *
 *	@param 	alarms 	Alarm models to write to the device.
 *	写入设备的闹钟模型数组。
 *	@param 	finished 	Completion callback with the applied alarm list and error.
 *	完成回调，返回已应用的闹钟列表及错误信息。
 */
+ (void)setBandAlarms:(NSArray <QCAlarmModel*>*)alarms finish:(void(^)(NSArray * _Nullable,NSError * _Nullable))finished;


/**
 *	@brief	Set menstrual-cycle reminder configuration on the device.
 *	设置设备经期提醒配置。
 *
 *	@param 	open 	Feature switch: YES = on, NO = off (protocol values: 1=on, 0=off, 2=invalid).
 *	功能开关：YES=开，NO=关（协议值：1=开，0=关，2=无效）。
 *	@param 	durationday 	Menstrual period duration in days (default 6).
 *	经期持续天数（默认 6）。
 *	@param 	intervalday 	Menstrual cycle length in days (default 28).
 *	月经周期天数（默认 28）。
 *	@param 	startday 	Days since last period start (0 = starts today).
 *	距上次经期开始的天数（0=今天开始）。
 *	@param 	endday 	Days since last period end (0 = ends today).
 *	距上次经期结束的天数（0=今天结束）。
 *	@param 	remindOpen 	Reminder switch. YES = on.
 *	提醒开关。YES=开启。
 *	@param 	beforemenstrday 	Days in advance to remind before menstrual period (1~3, default 2).
 *	经期提前提醒天数（1~3，默认 2）。
 *	@param 	beforeovulateday 	Days in advance to remind before ovulation (1~3, default 2).
 *	排卵期提前提醒天数（1~3，默认 2）。
 *	@param 	hour 	Reminder hour (0-23).
 *	提醒小时（0-23）。
 *	@param 	minute 	Reminder minute (0-59).
 *	提醒分钟（0-59）。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 *
 */
+ (void)setMenstrualFeature:(BOOL)open durationDay:(NSInteger)durationday intervalDay:(NSInteger)intervalday startDay:(NSInteger)startday endDay:(NSInteger)endday remindState:(BOOL)remindOpen menstrBeforeDay:(NSInteger)beforemenstrday ovulateBeforeDay:(NSInteger)beforeovulateday remindHour:(NSInteger)hour remindMinute:(NSInteger)minute finished:(void (^)(void))finished;

/**
 *	@brief	Deprecated. Use setMenstrualFeature:durationDay:intervalDay:... instead.
 *	已废弃。请改用 setMenstrualFeature:durationDay:intervalDay:...。
 *
 *	@param 	open 	Feature switch.
 *	功能开关。
 *	@param 	durationday 	Menstrual period duration in days (string).
 *	经期持续天数（字符串）。
 *	@param 	intervalday 	Menstrual cycle length in days (string).
 *	月经周期天数（字符串）。
 *	@param 	startday 	Days since last period start (string).
 *	距上次经期开始的天数（字符串）。
 *	@param 	endday 	Days since last period end (string).
 *	距上次经期结束的天数（字符串）。
 *	@param 	remindOpen 	Reminder switch.
 *	提醒开关。
 *	@param 	beforemenstrday 	Days in advance before menstrual period (string).
 *	经期提前提醒天数（字符串）。
 *	@param 	beforeovulateday 	Days in advance before ovulation (string).
 *	排卵期提前提醒天数（字符串）。
 *	@param 	hour 	Reminder hour (string).
 *	提醒小时（字符串）。
 *	@param 	minute 	Reminder minute (string).
 *	提醒分钟（字符串）。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)sendMenstrSettingFeatures:(BOOL)open durationDay:(NSString*)durationday intervalDay:(NSString*)intervalday startDay:(NSString*)startday endDay:(NSString*)endday remindState:(BOOL)remindOpen menstrBeforeDay:(NSString*)beforemenstrday ovulateBeforeDay:(NSString*)beforeovulateday remindHour:(NSString*)hour remindMinute:(NSString*)minute finished:(void (^)(void))finished __attribute__((deprecated("Use setMenstrualFeature: method")));

/**
 *	@brief	Send firmware bin for OTA upgrade. Results are delivered via callbacks.
 *	发送固件 bin 文件进行 OTA 升级，结果通过回调返回。
 *
 *	@param 	data 	OTA binary data.
 *	OTA 二进制数据。
 *	@param 	start 	Start-sending callback.
 *	开始发送回调。
 *	@param 	percentage 	Progress callback.
 *	进度回调。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	failed 	Failure callback.
 *	失败回调。
 */

+ (void)syncOtaBinData:(NSData *)data
                 start:(nullable void (^)(void))start
            percentage:(nullable void (^)(int percentage))percentage
               success:(nullable void (^)(int seconds))success
                failed:(nullable void (^)(NSError *_Nullable error))failed;

/**
 *	@brief	Send a watch-face bin file.
 *	发送表盘 bin 文件。
 *
 *	@param 	name 	Watch-face file name.
 *	表盘文件名。
 *	@param 	data 	Dial binary data.
 *	表盘二进制数据。
 *	@param 	start 	Start-sending callback.
 *	开始发送回调。
 *	@param 	percentage 	Progress callback.
 *	进度回调。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	failed 	Failure callback.
 *	失败回调。
 */
+ (void)syncDialFileName:(NSString *)name
                 binData:(NSData *)data
                   start:(nullable void (^)(void))start
              percentage:(nullable void (^)(int percentage))percentage
                 success:(nullable void (^)(int seconds))success
                  failed:(nullable void (^)(NSError *_Nullable error))failed;

/**
 *	@brief	Send files missing from the watch.
 *	发送手表缺失的文件。
 *
 *	@param 	name 	Watch missing file name.
 *	手表缺失文件名。
 *	@param 	data 	Watch missing file binary data.
 *	手表缺失文件的二进制数据。
 *	@param 	start 	Start sending callback.
 *	开始发送回调。
 *	@param 	percentage 	Progress callback.
 *	进度回调。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	failed 	Failure callback.
 *	失败回调。
 */
+ (void)syncResourceFileName:(NSString *)name
                     binData:(NSData *)data
                       start:(nullable void (^)(void))start
                  percentage:(nullable void (^)(int percentage))percentage
                     success:(nullable void (^)(int seconds))success
                      failed:(nullable void (^)(NSError *_Nullable error))failed;

/**
 *	@brief	Send a picture dial. Crop pixels to current band size (width/height verified by watch).
 *	发送图片表盘。请将像素裁剪为当前手环尺寸（手表会校验宽高）。
 *
 *	@param 	img 	Dial picture.
 *	表盘图片。
 *	@param 	start 	Start-sending callback.
 *	开始发送回调。
 *	@param 	percentage 	Progress callback.
 *	进度回调。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	failed 	Failure callback.
 *	失败回调。
 */
+ (void)syncImage:(UIImage *)img
            start:(nullable void (^)(void))start
       percentage:(nullable void (^)(int percentage))percentage
          success:(nullable void (^)(int seconds))success
           failed:(nullable void (^)(NSError *_Nullable error))failed;

/**
 *	@brief	Send a picture dial file. Crop pixels to the current watch size (width/height verified by watch).
 *	发送图片表盘文件。请将像素尺寸裁剪为当前手表尺寸（手表会校验宽高）。
 *
 *	@param 	img 	Watch face image.
 *	表盘图片。
 *	@param 	start 	Start sending callback.
 *	开始发送回调。
 *	@param 	percentage 	Progress callback.
 *	进度回调。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	failed 	Failure callback.
 *	失败回调。
 */
+ (void)syncImage:(UIImage *)img
     transparency:(int)transparency
             start:(nullable void (^)(void))start
        percentage:(nullable void (^)(int percentage))percentage
           success:(nullable void (^)(int seconds))success
            failed:(nullable void (^)(NSError *_Nullable error))failed;


/**
 *	@brief	Get sport records after a timestamp.
 *	获取指定时间戳之后的运动记录。
 *
 *	@param 	timeStamp 	Last synced timestamp.
 *	上次同步的时间戳。
 *	@param 	finish 	Completion callback with summaries and error.
 *	完成回调，返回运动概要列表及错误信息。
 */
+ (void)getSportRecordsFromLastTimeStamp:(NSTimeInterval)timeStamp finish:(void (^)(NSArray<OdmGeneralExerciseSummaryModel *> * _Nullable summaries,NSError * _Nullable error))finish;

/**
 *	@brief	Get the call-watch BT name.
 *	获取通话手表的 BT 名称。
 *
 *	@param 	finish 	Completion callback. btInfo: @{@"name":@"BTName", @"mac":@"aa:bb:cc"}.
 *	完成回调。btInfo：@{@"name":@"BTName", @"mac":@"aa:bb:cc"}。
 */
+ (void)getWatchCallBTName:(void (^)(NSDictionary * _Nullable btInfo,NSError * _Nullable error))finish;


/**
 *	@brief	Set contacts (some devices only).
 *	设置通讯录（仅部分设备支持）。
 *
 *	@param 	contacts 	Contact list, e.g. @[@{@"name":@"allen", @"phone":@"123546"}, ...].
 *	通讯录列表，例如 @[@{@"name":@"allen", @"phone":@"123546"}, ...]。
 *	@param 	percentage 	Progress callback.
 *	进度回调。
 *	@param 	finish 	Completion callback.
 *	完成回调。
 */
+ (void)setContacts:(NSArray<NSDictionary*>*)contacts percentage:(nullable void (^)(int percentage))percentage finish:(void (^)(NSError * _Nullable error))finish;

/**
 *	@brief	Real-time heart-rate measuring command.
 *	实时心率测量指令。
 *
 *	@param 	type 	Command type. See QCBandRealTimeHeartRateCmdType.
 *	指令类型，参见 QCBandRealTimeHeartRateCmdType。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)realTimeHeartRateWithCmd:(QCBandRealTimeHeartRateCmdType)type finished:(nullable void (^)(BOOL))finished;

/**
 *	@brief	Get dial display index.
 *	获取表盘显示索引号。
 *
 *	@param 	finished 	Completion callback. index: 0-N, 0=wallpaper.
 *	完成回调。index：0-N，0=壁纸。
 */
+ (void)getDialIndexWithFinshed:(nullable void (^)(NSInteger,NSError *_Nullable error))finished;


/**
 *	@brief	Set dial display index (some devices only).
 *	设置表盘显示索引号（仅部分设备支持）。
 *
 *	@param 	index 	Dial index: 0-N, 0=wallpaper.
 *	表盘索引：0-N，0=壁纸。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setDialIndexWith:(NSInteger)index finshed:(nullable void (^)(NSError *_Nullable error))finished;


/**
 *	@brief	Get low-power mode status (some devices only).
 *	获取低电量开关状态（仅部分设备支持）。
 *
 *	@param 	finished 	Completion callback. isON: NO=off, YES=on.
 *	完成回调。isON：NO=关闭，YES=开启。
 */
+ (void)getLowPowerWithFinshed:(nullable void (^)(BOOL,NSError *_Nullable error))finished;

/**
 *	@brief	Set low-power mode status (some devices only).
 *	设置低电量状态（仅部分设备支持）。
 *
 *	@param 	isOn 	NO=OFF, YES=ON.
 *	NO=关闭，YES=开启。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setLowPowerWith:(BOOL)isOn finshed:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Get blood glucose data (some devices only).
 *	获取血糖数据（仅部分设备支持）。
 *
 *	@param 	dayIndex 	Day index: 0-6, 0=today, 1=yesterday, ...
 *	距今天数：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getBloodGlucoseDataByDayIndex:(NSInteger)dayIndex finished:(void (^)(NSArray * _Nullable, NSError * _Nullable))finished;


/**
 *	@brief	Get manual blood oxygen data (some devices only).
 *	获取手动血氧数据（仅部分设备支持）。
 *
 *	@param 	dayIndex 	Day index: 0-6, 0=today, 1=yesterday, ...
 *	距今天数：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getManualBloodOxygenDataByDayIndex:(NSInteger)dayIndex finished:(void (^)(NSArray * _Nullable, NSError * _Nullable))finished;


/**
 *	@brief	Get scheduled stress data (ring devices only).
 *	获取定时压力数据（仅戒指设备支持）。
 *
 *	@param 	dates 	Day indexes: 0-6, 0=today, 1=yesterday, ...
 *	天数索引：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getSchedualStressDataWithDates:(NSArray<NSNumber*> *)dates finished:(void (^)(NSArray * _Nullable, NSError * _Nullable))finished;;


/**
 *	@brief	Get scheduled stress status.
 *	获取定时压力开关状态。
 *
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getSchedualStressStatusWithFinshed:(nullable void (^)(BOOL,NSError *_Nullable error))finished;

/**
 *	@brief	Set scheduled stress status.
 *	设置定时压力开关状态。
 *
 *	@param 	enable 	YES=On, NO=Off.
 *	YES=开启，NO=关闭。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setSchedualStressStatus:(BOOL)enable finshed:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Get scheduled emotion status (0x3A, AA=0x05).
 *	获取定时情绪测量开关状态（0x3A，AA=0x05）。
 *
 *	@param 	finished 	Completion callback; isOn = whether auto measurement is enabled.
 *	完成回调；isOn 表示自动测量是否开启。
 */
+ (void)getSchedualEmotionStatusWithFinshed:(nullable void (^)(BOOL isOn, NSError *_Nullable error))finished;


/**
 *	@brief	Set scheduled emotion status (0x3A, AA=0x05).
 *	设置定时情绪测量开关状态（0x3A，AA=0x05）。
 *
 *	@param 	enable 	YES=On, NO=Off.
 *	YES=开启，NO=关闭。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setSchedualEmotionStatus:(BOOL)enable finshed:(nullable void (^)(NSError *_Nullable error))finished;


/**
 *	@brief	Get pressure samples with absolute timestamps (preferred, 0x7B long packet, AA=1).
 *	获取压力采样点（推荐接口，0x7B 长包，AA=1）。每个采样点已包含绝对时间，用法类似 QCTemperatureModel.time。
 *
 *	SDK expands the device raw array as: sample.time = dayStart + index * intervalMinutes.
 *	SDK 按公式展开：sample.time = 当天0点 + index × intervalMinutes。
 *	sample.value == 0 means no valid reading at that slot.
 *	sample.value == 0 表示该时段无有效压力值。
 *
 *	@param 	dayIndexes 	Day indexes: 0-6, 0=today, 1=yesterday, ...
 *	天数索引：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback with NSArray<QCPressureDayModel *> and error.
 *	完成回调，返回按天分组的 QCPressureDayModel 列表及错误信息。
 */
+ (void)getPressureSamplesWithDayIndexes:(NSArray<NSNumber *> *)dayIndexes
                                finished:(void (^)(NSArray<QCPressureDayModel *> * _Nullable days, NSError * _Nullable error))finished;

/**
 *	@brief	Get other-data pressure records as a raw value array (legacy).
 *	获取其他数据中的压力记录（原始 values 数组，旧接口）。
 *
 *	@param 	dayIndexes 	Day indexes: 0-6, 0=today, 1=yesterday, ...
 *	天数索引：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getOtherDataPressureWithDayIndexes:(NSArray<NSNumber *> *)dayIndexes finished:(void (^)(NSArray<QCOtherDataPressureModel *> * _Nullable, NSError * _Nullable))finished
    __deprecated_msg("Use +getPressureSamplesWithDayIndexes:finished:; each QCPressureSampleModel provides time (like QCTemperatureModel).");


/**
 *	@brief	Get scheduled stress status and interval (some devices only).
 *	获取定时压力监测开关及时间间隔（仅部分设备支持）。
 *
 *	@param 	finished 	Completion callback: enable (YES=On/NO=Off),
 *	minInterval (minutes), currentInterval (minutes).
 *	完成回调：enable（YES=开/NO=关）、minInterval（分钟）、currentInterval（分钟）。
 */
+ (void)getSchedualStressStatusWithIntervalFinshed:(nullable void (^)(BOOL,NSInteger,NSInteger,NSError *_Nullable error))finished;

/**
 *	@brief	Set scheduled stress status and interval (some devices only).
 *	设置定时压力监测开关及时间间隔（仅部分设备支持）。
 *
 *	@param 	enable 	YES=On, NO=Off.
 *	YES=开启，NO=关闭。
 *	@param 	interval 	Interval in minutes, must be >= minInterval.
 *	间隔（分钟），须 >= minInterval。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setSchedualStressStatus:(BOOL)enable interval:(NSInteger)interval finshed:(nullable void (^)(NSError *_Nullable error))finished;


/**
 *	@brief	Get other-data emotion records (0x7B long packet, AA=2).
 *	获取其他数据中的情绪记录（0x7B 长包，AA=2）。
 *
 *	@param 	dayIndexes 	Day indexes: 0-6, 0=today, 1=yesterday, ...
 *	天数索引：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getOtherDataEmotionWithDayIndexes:(NSArray<NSNumber *> *)dayIndexes finished:(void (^)(NSArray<QCOtherDataEmotionModel *> * _Nullable, NSError * _Nullable))finished;


/**
 *	@brief	Set sport mode state.
 *	设置运动模式状态。
 *
 *	@param 	sportType 	Sport type.
 *	运动类型。
 *	@param 	state 	Sport state.
 *	运动状态。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)operateSportModeWithType:(OdmSportPlusExerciseModelType)sportType state:(QCSportState)state finish:(void(^)(id _Nullable,NSError * _Nullable))finished;


/**
 *	@brief	Get HRV samples with absolute timestamps (preferred, 0x39).
 *	获取 HRV 采样点（推荐接口，0x39）。SDK 将设备原始槽位归一化到 5 分钟 / 288 点全天时间轴。
 *
 *	SDK expands device raw slots as: sample.time = dayStart + index * 5min.
 *	SDK 按 5 分钟网格展开：sample.time = 当天0点 + index × 5min，共 288 点。
 *	sample.value == 0 means no valid reading at that slot.
 *	sample.value == 0 表示该时段无有效 HRV 值。
 *
 *	@param 	dayIndexes 	Day indexes: 0-6, 0=today, 1=yesterday, ...
 *	天数索引：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback with NSArray<QCHRVDayModel *> and error.
 *	完成回调，返回按天分组的 QCHRVDayModel 列表及错误信息。
 */
+ (void)getHRVSamplesWithDayIndexes:(NSArray<NSNumber *> *)dayIndexes
                           finished:(void (^)(NSArray<QCHRVDayModel *> * _Nullable days, NSError * _Nullable error))finished;

/**
 *	@brief	Get scheduled HRV data (ring devices only, legacy raw array).
 *	获取定时 HRV 数据（仅戒指设备支持，旧接口原始数组）。
 *
 *	@param 	dates 	Day indexes: 0-6, 0=today, 1=yesterday, ...
 *	天数索引：0-6，0=今天，1=昨天……
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getSchedualHRVDataWithDates:(NSArray<NSNumber*> *)dates finished:(void (^)(NSArray * _Nullable, NSError * _Nullable))finished
    __deprecated_msg("Use +getHRVSamplesWithDayIndexes:finished:; each QCHRVSampleModel provides time (288 slots/day at 5-min grid).");

/**
 *	@brief	Get scheduled HRV status.
 *	获取定时 HRV 开关状态。
 *
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getSchedualHRVWithFinshed:(nullable void (^)(BOOL,NSError *_Nullable error))finished;

/**
 *	@brief	Set scheduled HRV status.
 *	设置定时 HRV 开关状态。
 *
 *	@param 	enable 	YES=On, NO=Off.
 *	YES=开启，NO=关闭。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setSchedualHRVStatus:(BOOL)enable finshed:(nullable void (^)(NSError *_Nullable error))finished;


/**
 *	@brief	Get touch control type (not for RT11).
 *	获取触摸控制类型（不适用于 RT11）。
 *
 *	@param 	finished 	Callback: type=QCTouchGestureControlType, strength=1-10,
 *	sleeping=YES/NO, duration=sleep duration (minutes).
 *	回调：type=QCTouchGestureControlType，strength=1-10，
 *	sleeping=YES/NO，duration=休眠时长（分钟）。
 */
+ (void)getTouchControlFinshed:(nullable void (^)(QCTouchGestureControlType,NSInteger,BOOL,NSInteger,NSError *_Nullable error))finished;

/**
 *	@brief	Set touch control type (not for RT11).
 *	设置触摸控制类型（不适用于 RT11）。
 *
 *	@param 	type 	Control type.
 *	控制类型。
 *	@param 	strength 	1-10 (default 1, reserved).
 *	强度 1-10（默认 1，预留值）。
 *	@param 	duration 	Sleep duration in minutes (1-10).
 *	休眠时长，单位：分钟（1-10）。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setTouchControl:(QCTouchGestureControlType)type strength:(NSInteger)strength duration:(NSInteger)duration finshed:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Get touch control type (supports RT11 etc.).
 *	获取触摸控制类型（支持 RT11 等）。
 *
 *	@param 	finished 	Callback: type, strength(1-10), sleeping, duration.
 *	回调：类型、强度(1-10)、是否休眠、休眠时长。
 */
+ (void)getTouchControlOfScreenDevieFinshed:(nullable void (^)(QCTouchGestureControlType,NSInteger,BOOL,NSInteger,NSError *_Nullable error))finished;

/**
 *	@brief	Set touch control type (supports RT11 etc.).
 *	设置触摸控制类型（支持 RT11 等）。
 *
 *	@param 	type 	Control type.
 *	控制类型。
 *	@param 	strength 	1-10 (default 1, reserved).
 *	强度 1-10（默认 1，预留值）。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setTouchControlOfScreenDevie:(QCTouchGestureControlType)type strength:(NSInteger)strength duration:(NSInteger)duration finshed:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Get gesture control type.
 *	获取手势控制类型。
 *
 *	@param 	finished 	Callback: type=QCTouchGestureControlType, strength=1-10.
 *	回调：type=QCTouchGestureControlType，strength=1-10。
 */
+ (void)getGestureControlFinshed:(nullable void (^)(QCTouchGestureControlType,NSInteger,BOOL,NSError *_Nullable error))finished;


/**
 *	@brief	Set gesture control type.
 *	设置手势控制类型。
 *
 *	@param 	type 	Control type.
 *	控制类型。
 *	@param 	strength 	1-10.
 *	强度 1-10。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)setGestureControl:(QCTouchGestureControlType)type strength:(NSInteger)strength finshed:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Wearing calibration command.
 *	佩戴校准指令。
 *
 *	@param 	type 	1=Start calibration (reset ring data), 2=End calibration,
 *	3=Get single data, 4=Power consumption mode, 5=Stop power consumption,
 *	6=App starts calibration.
 *	1=开始校准（重置戒指数据），2=结束校准，3=获取单次数据，
 *	4=功耗模式，5=停止功耗模式，6=App 开始校准。
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)wearCalibration:(NSInteger)type finshed:(nullable void (^)(NSError *_Nullable error))finished;


/**
 *	@brief	Get sedentary reminder data (ring devices only).
 *	获取久坐提醒数据（仅戒指设备支持）。
 *
 *	@param 	fromDayIndex 	0=Today, 1=Yesterday, 2=The day before yesterday, ...
 *	0=今天，1=昨天，2=前天……
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getSedentaryReminderFromDay:(NSInteger)fromDayIndex finished:(nullable void (^)(NSDictionary <NSString*,NSArray<QCSedentaryModel*>*>*_Nullable datas, NSError *_Nullable error))finished;

/**
 *	@brief	Set scheduled measurement info (ring devices only).
 *	设置定时测量信息（仅戒指设备支持）。
 *
 *	@param 	type 	Scheduled info type. See SchedualInfoType.
 *	定时信息类型，参见 SchedualInfoType。
 *	@param 	featureOn 	YES to enable the feature, NO to disable.
 *	YES 开启功能，NO 关闭功能。
 *	@param 	calibrate 	Calibration value for the feature. Meaning depends on type; pass 0 if unused.
 *	功能校准值。含义取决于类型；未使用时传 0。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setSchedualInfoType:(SchedualInfoType)type featureOn:(BOOL)featureOn calibrate:(NSInteger)calibrate success:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;


/**
 *	@brief	Set scheduled measurement info with interval (ring devices only).
 *	设置带间隔的定时测量信息（仅戒指设备支持）。
 *
 *	@param 	type 	Scheduled info type. See SchedualInfoType.
 *	定时信息类型，参见 SchedualInfoType。
 *	@param 	featureOn 	YES to enable the feature, NO to disable.
 *	YES 开启功能，NO 关闭功能。
 *	@param 	calibrate 	Calibration value for the feature. Meaning depends on type; pass 0 if unused.
 *	功能校准值。含义取决于类型；未使用时传 0。
 *	@param 	interval 	Measurement / sampling interval. Unit depends on type (commonly minutes).
 *	测量/采样间隔。单位取决于类型（通常为分钟）。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setSchedualInfoType:(SchedualInfoType)type featureOn:(BOOL)featureOn calibrate:(NSInteger)calibrate interval:(NSInteger)interval success:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get scheduled measurement info (ring devices only).
 *	获取定时测量信息（仅戒指设备支持）。
 *
 *	@param 	type 	Scheduled info type. See SchedualInfoType.
 *	定时信息类型，参见 SchedualInfoType。
 *	@param 	success 	Success callback: (featureOn, calibrate).
 *	成功回调：（是否开启，校准值）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSchedualInfoType:(SchedualInfoType)type success:(void (^)(BOOL, NSInteger))success fail:(void (^)(void))fail;

/**
 *	@brief	Set left/right hand wearing info (ring devices only).
 *	设置左右手佩戴信息（仅戒指设备支持）。
 *
 *	@param 	model 	Flip-wrist / wearing info model. Pass nil only if the protocol allows clearing.
 *	翻腕/佩戴信息模型。仅在协议允许清空时才可传 nil。
 *	@param 	finished 	Completion callback with error.
 *	完成回调（含错误信息）。
 */
+ (void)setFlipWristInfo:(QCFlipWristInfoModel*_Nullable)model finshed:(nullable void (^)(NSError *_Nullable error))finished;

/**
 *	@brief	Get left/right hand wearing info (ring devices only).
 *	获取左右手佩戴信息（仅戒指设备支持）。
 *
 *	@param 	finished 	Completion callback.
 *	完成回调。
 */
+ (void)getFlipWristInfoFinshed:(nullable void (^)(QCFlipWristInfoModel*_Nullable,NSError *_Nullable))finished;

/**
 *	@brief	Configure scheduled blood oxygen (BO) monitoring.
 *	配置定时血氧监测。
 *
 *	@param 	featureOn 	YES to enable scheduled BO monitoring, NO to disable.
 *	YES 开启定时血氧监测，NO 关闭。
 *	@param 	timeInterval 	Monitoring interval in minutes.
 *	监测间隔，单位：分钟。
 *	@param 	success 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setSchedualBOInfoOn:(BOOL)featureOn
                timeInterval:(NSInteger)timeInterval
                     success:(void (^)(void))success
                        fail:(void (^)(void))fail;

/**
 *	@brief	Retrieve scheduled blood oxygen (BO) monitoring configuration.
 *	获取定时血氧监测配置。
 *
 *	@param 	success 	Success callback with two parameters:
 *	                BOOL → whether scheduled BO monitoring is enabled
 *	                NSInteger → monitoring interval in minutes
 *	成功回调，两个参数：
 *	BOOL → 定时血氧是否开启
 *	NSInteger → 监测间隔（分钟）
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSchedualBOInfoWithIntervalSuccess:(void (^)(BOOL, NSInteger))success
                                        fail:(void (^)(void))fail;

/**
 *	@brief	Get blood oxygen (BO) data for a specific day.
 *	获取某天的血氧数据。
 *
 *	@param 	dayIndex 	Index of the day (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	finished 	Completion callback with three parameters:
 *	                 NSInteger → Number of data entries / interval
 *	                 NSArray → Array of BO data (nullable)
 *	                 NSError → Error information (nullable)
 *	完成回调，三个参数：
 *	NSInteger → 数据条目数/间隔
 *	NSArray → 血氧数据数组（可空）
 *	NSError → 错误信息（可空）
 */
+ (void)getBloodOxygenDataWithIntervalByDayIndex:(NSInteger)dayIndex
                                         finished:(void (^)(NSInteger, NSArray * _Nullable, NSError * _Nullable))finished;

/**
 *	@brief	Get temperature data for a specific day with interval.
 *	获取某天带间隔信息的体温数据。
 *
 *	@param 	dayIndex 	Index of the day (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	finished 	Completion callback with three parameters:
 *	                 NSInteger → Interval in minutes
 *	                 NSArray → Array of temperature data (nullable)
 *	                 NSError → Error information (nullable)
 *	完成回调，三个参数：
 *	NSInteger → 间隔（分钟）
 *	NSArray → 体温数据数组（可空）
 *	NSError → 错误信息（可空）
 */
+ (void)getTemperatureDataWithIntervalByDayIndex:(NSInteger)dayIndex
                                        finished:(void (^)(NSInteger, NSArray * _Nullable, NSError * _Nullable))finished;

/**
 *	@brief	Get temperature data for a specific day by pocket index.
 *	按分包索引获取某天的体温数据。
 *
 *	@param 	dayIndex 	Index of the day (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	pocketIndex 	Pocket index (starts from 0).
 *	分包索引（从 0 开始）。
 *	@param 	finished 	Completion callback with interval, data list, error, pocketCount, pocketIndex.
 *	完成回调，返回间隔、数据列表、错误、总分包数、当前分包索引。
 */

+ (void)getTemperatureDataByDayIndex:(NSInteger)dayIndex pocketIndex:(NSInteger)pocketIndex finished:(nullable void (^)(NSInteger interval,NSArray *_Nullable dataList, NSError *_Nullable error,NSInteger pocketCount,NSInteger pocketIndex))finished;

/**
 *	@brief	Shut down the device.
 *	关闭设备。
 *
 *	@param 	success 	Callback when shutdown is successful.
 *	关机成功回调。
 *	@param 	fail 	Callback when shutdown fails.
 *	关机失败回调。
 */
+ (void)shutDownSuccess:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get praise/prayer data for specific day indexes.
 *	按天数索引获取赞美/祈祷数据。
 *
 *	@param 	dayIndexs 	Array of day indexes (0=today, 1=yesterday, etc.).
 *	天数索引数组（0=今天，1=昨天，以此类推）。
 *	@param 	finished 	Completion callback with array of praise data and error information.
 *	完成回调，返回赞美/祈祷数据数组及错误信息。
 */
+ (void)getPraiseDataByDayIndexs:(NSArray<NSNumber *> *)dayIndexs finished:(void (^)(NSArray *_Nullable praiseList, NSError *_Nullable error))finished;

/**
 *	@brief	Clear all praise/prayer data from the device.
 *	清除设备上的全部赞美/祈祷数据。
 *
 *	@param 	success 	Callback when clear operation is successful.
 *	清除成功回调。
 *	@param 	fail 	Callback when clear operation fails.
 *	清除失败回调。
 */
+ (void)clearPraiseDataWithSuccess:(nullable void (^)(void))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Get one-minute heart rate data for a specific day.
 *	获取某天的一分钟心率数据。
 *
 *	@param 	dayIndex 	Index of the day (0 = today, 1 = yesterday, and so on).
 *	距今天数（0=今天，1=昨天，以此类推）。
 *	@param 	finished 	Completion callback with two parameters:
 *	                 NSArray → one-minute heart rate data (nullable)
 *	                 NSError → error information (nullable)
 *	完成回调，两个参数：
 *	NSArray → 一分钟心率数据（可空）
 *	NSError → 错误信息（可空）
 */
+ (void)getOneMinuHeartRateDataWithIntervalByDayIndex:(NSInteger)dayIndex
                                             finished:(void (^)(NSArray * _Nullable, NSError * _Nullable))finished;

/**
 *	@brief	Set scheduled heart rate monitoring configuration with all parameters.
 *	设置定时心率监测的完整配置。
 *
 *	@param 	enable 	Whether to enable scheduled heart rate monitoring. YES = enabled, NO = disabled.
 *	是否开启定时心率监测。YES=开启，NO=关闭。
 *	@param 	interval 	Heart rate measurement interval in minutes.
 *	心率测量间隔，单位：分钟。
 *	@param 	maxHrTip 	Automatic heart rate alarm maximum threshold (bpm).
 *	自动心率报警上限（bpm）。
 *	@param 	minHrTip 	Automatic heart rate alarm minimum threshold (bpm).
 *	自动心率报警下限（bpm）。
 *	@param 	success 	Success callback: (enable, interval).
 *	成功回调：（是否开启，测量间隔）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setSchedualHeartRateStatus:(BOOL)enable interval:(NSInteger)interval maxHrTip:(NSInteger)maxHrTip minHrTip:(NSInteger)minHrTip success:(nullable void (^)(BOOL enable, NSInteger interval))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set scheduled heart rate monitoring configuration with interval only.
 *	仅设置定时心率监测开关与间隔。
 *
 *	@param 	enable 	Whether to enable scheduled heart rate monitoring. YES = enabled, NO = disabled.
 *	是否开启定时心率监测。YES=开启，NO=关闭。
 *	@param 	interval 	Heart rate measurement interval in minutes.
 *	心率测量间隔，单位：分钟。
 *	@param 	success 	Success callback: (enable, interval).
 *	成功回调：（是否开启，测量间隔）。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setSchedualHeartRateStatus:(BOOL)enable interval:(NSInteger)interval success:(nullable void (^)(BOOL enable, NSInteger interval))success fail:(nullable void (^)(void))fail;


/**
 *	@brief	Get scheduled heart-rate configuration (enable, interval, tips).
 *	获取定时心率配置（开关、间隔、报警阈值）。
 *
 *	@param 	success 	Success callback:
 *	                enable — whether scheduled HR is on
 *	                interval — measurement interval in minutes
 *	                minInterval — minimum allowed interval in minutes
 *	                minHrTip — low HR alarm threshold in bpm
 *	                maxHrTip — high HR alarm threshold in bpm
 *	成功回调：
 *	enable — 定时心率是否开启
 *	interval — 测量间隔（分钟）
 *	minInterval — 允许的最小间隔（分钟）
 *	minHrTip — 低心率报警阈值（bpm）
 *	maxHrTip — 高心率报警阈值（bpm）
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getSchedualHeartRateInfoWithSuccess:(nullable void (^)(BOOL enable, NSInteger interval, NSInteger minInterval, NSInteger minHrTip, NSInteger maxHrTip))success fail:(nullable void (^)(void))fail;

/**
 *	@brief	Set RRI auto-measure switch.
 *	设置 RRI 自动测量开关。
 *
 *	@param 	isOpen 	YES to enable RRI auto measurement, NO to disable.
 *	YES 开启 RRI 自动测量，NO 关闭。
 *	@param 	suc 	Success callback.
 *	成功回调。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)setRRIAutoMeasureStatus:(BOOL)isOpen suc:(void(^)(void))suc fail:(void(^)(void))fail;

/**
 *	@brief	Get RRI auto-measure switch status.
 *	获取 RRI 自动测量开关状态。
 *
 *	@param 	suc 	Success callback. YES = enabled, NO = disabled.
 *	成功回调。YES=开启，NO=关闭。
 *	@param 	fail 	Failure callback.
 *	失败回调。
 */
+ (void)getRRIAutoMeasureStatusWithSuccess:(void(^)(BOOL))suc fail:(void(^)(void))fail;
@end

NS_ASSUME_NONNULL_END
