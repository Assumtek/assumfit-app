//
//  QCSDKManager.h
//  QCBandSDK
//
//  Created by steve on 2021/7/7.
//

#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <UIKit/UIKit.h>
#import <QCBandSDK/QCDFU_Utils.h>
#import <QCBandSDK/QCSportInfoModel.h>

NS_ASSUME_NONNULL_BEGIN

/*!
 *  @discussion Service IDs supported by the device
 *  设备支持的服务 UUID
 */

extern NSString *const QCBANDSDKSERVERUUID1;
extern NSString *const QCBANDSDKSERVERUUID2;


/**
 *	@brief	Health measurement type used by start/stop measuring APIs.
 *	开始/停止测量接口使用的健康测量类型。
 *
 *	#### Result payload in measuring / completed callbacks depends on the type:
 *	#### measuring / completed 回调中的结果类型取决于测量类型：
 *	- Heart rate: NSNumber, unit bpm, e.g. @(60)
 *	- 心率：NSNumber，单位 bpm，例如 @(60)
 *	- Blood pressure: NSDictionary, e.g. @{@"sbp":@"120", @"dbp":@"60"}
 *	- 血压：NSDictionary，例如 @{@"sbp":@"120", @"dbp":@"60"}
 *	- Blood oxygen: NSNumber, unit %, e.g. @(98)
 *	- 血氧：NSNumber，单位 %，例如 @(98)
 *	- Stress / blood glucose / HRV / body temperature: NSNumber
 *	- 压力 / 血糖 / HRV / 体温：NSNumber
 *	- Raw PPG types: NSArray of raw sample models
 *	- PPG 原始数据类型：原始采样模型数组 NSArray
 */
typedef NS_ENUM(NSInteger, QCMeasuringType) {
    QCMeasuringTypeUnkown = -1,                         ///< Invalid / unknown 无效/未知
    QCMeasuringTypeHeartRate = 0,                       ///< Heart rate measurement 心率测量
    QCMeasuringTypeBloodPressue,                        ///< Blood pressure measurement 血压测量
    QCMeasuringTypeBloodOxygen,                         ///< Blood oxygen (SpO2) measurement 血氧测量
    QCMeasuringTypeOneKeyMeasure,                       ///< One-key multi-item measurement 一键测量
    QCMeasuringTypeStress,                              ///< Stress measurement 压力测量
    QCMeasuringTypeBloodGlucose,                        ///< Blood glucose measurement 血糖测量
    QCMeasuringTypeHRV,                                 ///< HRV measurement (default timeout 80s) HRV测量（默认超时80秒）
    QCMeasuringTypeBodyTemperature,                     ///< Body temperature measurement 体温测量
    QCMeasuringTypeThreeValueBodyTemperature,           ///< Three-value body temperature measurement 三值体温测量
    QCMeasuringTypeOneKeyMeasureHeartRate,              ///< One-key heart rate measurement 一键心率测量
    QCMeasuringTypeHeartRateRaw,                        ///< Heart rate raw PPG data (default timeout 90s) 心率PPG原始数据（默认超时90秒）
    QCMeasuringTypeBloodOxygenRaw,                      ///< Blood oxygen raw PPG data 血氧PPG原始数据
    QCMeasuringTypeCount,
};

@class QCSimpleDialFileModel;
@interface QCSDKManager : NSObject 

/**
 *	@brief	SDK debug log switch. YES to print SDK debug logs (default); NO to silence them.
 *	SDK 调试日志开关。YES：输出调试日志（默认）；NO：关闭调试日志。
 */
@property(nonatomic,assign)BOOL debug;

/**
 *	@brief	Callback when the watch requests to find the phone.
 *	手表发起“查找手机”时的回调。
 *
 *	@param 	status 	1 = start finding phone, 2 = end finding phone.
 *	1 = 开始查找手机，2 = 结束查找手机。
 */
@property(nonatomic,copy,nullable)void(^findPhone)(NSInteger status);

/**
 *	@brief	Callback when the watch enters the camera UI.
 *	手表进入拍照界面时的回调。
 */
@property(nonatomic,copy,nullable)void(^switchToPicture)(void);

/**
 *	@brief	Callback when the watch requests to take a photo.
 *	手表请求拍照时的回调。
 */
@property(nonatomic,copy,nullable)void(^takePicture)(void);

/**
 *	@brief	Callback when the watch ends the camera session.
 *	手表结束拍照会话时的回调。
 */
@property(nonatomic,copy,nullable)void(^stopTakePicture)(void);

/**
 *	@brief	Callback for single heart-rate measurement values reported by the watch.
 *	手表上报单次心率测量值的回调。
 *
 *	#### Some watches only. Triggered after the app sends a single measuring command.
 *	#### 仅部分手表支持。App 发送单次测量指令后触发。
 *
 *	@param 	hr 	Heart rate value in bpm.
 *	心率值，单位 bpm。
 */
@property(nonatomic,copy,nullable)void(^hrMeasuring)(NSInteger hr);

/**
 *	@brief	Callback for single blood-pressure measurement values reported by the watch.
 *	手表上报单次血压测量值的回调。
 *
 *	#### Some watches only. Triggered after the app sends a single measuring command.
 *	#### 仅部分手表支持。App 发送单次测量指令后触发。
 *
 *	@param 	sbp 	Systolic blood pressure (mmHg).
 *	收缩压（mmHg）。
 *	@param 	dbp 	Diastolic blood pressure (mmHg).
 *	舒张压（mmHg）。
 */
@property(nonatomic,copy,nullable)void(^bpMeasuring)(NSInteger sbp,NSInteger dbp);

/**
 *	@brief	Callback for single blood-oxygen measurement values reported by the watch.
 *	手表上报单次血氧测量值的回调。
 *
 *	#### Some watches only. Triggered after the app sends a single measuring command.
 *	#### 仅部分手表支持。App 发送单次测量指令后触发。
 *
 *	@param 	so2 	Blood oxygen (SpO2) percentage.
 *	血氧（SpO2）百分比。
 */
@property(nonatomic,copy,nullable)void(^boMeasuring)(CGFloat so2);

/**
 *	@brief	Callback when a single measurement fails (e.g. device not worn properly).
 *	单次测量失败时的回调（例如设备未正确佩戴）。
 *
 *	#### Some watches only. Triggered after the app sends a single measuring command.
 *	#### 仅部分手表支持。App 发送单次测量指令后触发。
 */
@property(nonatomic,copy,nullable)void(^measuringFail)(void);

/**
 *	@brief	Callback for real-time heart-rate values.
 *	实时心率值回调。
 *
 *	#### Triggered after the app sends a real-time heart-rate measuring command.
 *	#### App 发送实时心率测量指令后触发。
 *
 *	@param 	hr 	Heart rate value in bpm.
 *	心率值，单位 bpm。
 */
@property(nonatomic,copy,nullable)void(^realTimeHeartRate)(NSInteger hr);

/**
 *	@brief	Callback when the watch dial index changes.
 *	手表表盘索引切换时的回调。
 *
 *	@param 	index 	Dial index (0-N). 0 = wallpaper dial.
 *	表盘索引（0-N）。0 = 壁纸表盘。
 */
@property(nonatomic,copy,nullable)void(^dailIndex)(NSInteger index);

/**
 *	@brief	Callback when the watch low-power mode changes.
 *	手表低电量模式切换时的回调。
 *
 *	@param 	status 	YES = ON, NO = OFF.
 *	YES = 开启，NO = 关闭。
 */
@property(nonatomic,copy,nullable)void(^lowerPower)(BOOL status);

/**
 *	@brief	Callback when current step / calorie / distance increases.
 *	当前步数 / 卡路里 / 距离增加时的回调。
 *
 *	#### Some watches only.
 *	#### 仅部分手表支持。
 *
 *	@param 	step 	Step count.
 *	步数。
 *	@param 	calorie 	Calories.
 *	卡路里。
 *	@param 	distance 	Distance in meters.
 *	距离，单位：米。
 */
@property(nonatomic,copy,nullable)void(^currentStepInfo)(NSInteger step,NSInteger calorie,NSInteger distance);

/**
 *	@brief	Callback when device data-update events are reported (protocol 0x73).
 *	设备数据更新事件上报时的回调（协议 0x73）。
 *
 *	@param 	dataType 	Update report type. See QCDeviceDataUpdateReport.
 *	更新上报类型，参见 QCDeviceDataUpdateReport。可用 QCDeviceDataUpdateReportName() 打印可读名称。
 *	@param 	dataValue 	Primary payload value for the report type (usually BB byte).
 *	该上报类型的主要数值（通常为 BB 字节）。含义见 QCDeviceDataUpdateReportValueHint()。
 *
 *	@note	Some types have dedicated callbacks with richer payloads:
 *	@note	部分类型有专用回调，携带更完整的数据：
 *	- QCDeviceDataUpdatePower → currentBatteryInfo
 *	- QCDeviceDataUpdateStepInfo → currentStepInfo
 *	- QCDeviceDataUpdateRaiseToWake → flipWristInfo
 *	- QCDeviceDataUpdateTouchControl → gestureAndTouchInfo
 *	- QCDeviceDataUpdateTouchSleep → touchSleepInfo
 *	- QCDeviceDataUpdateDialIndex → dailIndex
 *	- QCDeviceDataUpdateLowPower → lowerPower
 */
@property(nonatomic,copy,nullable)void(^watchDataUpdateReport)(QCDeviceDataUpdateReport dataType,NSInteger dataValue);

/**
 *	@brief	Callback for real-time sport info while a workout is running.
 *	运动进行中实时运动信息回调。
 *
 *	@param 	sportInfo 	Current sport info model.
 *	当前运动信息型号。
 */
@property(nonatomic,copy,nullable)void(^currentSportInfo)(QCSportInfoModel *sportInfo);

/**
 *	@brief	Callback for real-time battery info reports.
 *	实时电量信息上报回调。
 *
 *	@param 	battery 	Battery percentage.
 *	电量百分比。
 *	@param 	charging 	YES if charging.
 *	是否正在充电：YES 表示充电中。
 */
@property(nonatomic,copy,nullable)void(^currentBatteryInfo)(NSInteger battery,BOOL charging);

/**
 *	@brief	Callback for left/right hand wearing reports.
 *	左右手佩戴信息上报回调。
 *
 *	@param 	enable 	Whether wearing detection / flip-wrist feature is enabled.
 *	佩戴检测 / 翻腕功能是否开启。
 *	@param 	hand 	1 = left hand, 2 = right hand.
 *	1 = 左手，2 = 右手。
 */
@property(nonatomic,copy,nullable)void(^flipWristInfo)(NSInteger enable,NSInteger hand);

/**
 *	@brief	Callback for gesture and touch control events.
 *	手势与触摸控制事件回调。
 *
 *	@param 	mode 	0 = touch, 1 = gesture.
 *	0 = 触摸，1 = 手势。
 *	@param 	type 	Control type. See QCTouchGestureControlType.
 *	控制类型，参见 QCTouchGestureControlType。
 */
@property(nonatomic,copy,nullable)void(^gestureAndTouchInfo)(NSInteger mode,QCTouchGestureControlType type);

/**
 *	@brief	Callback for touch-sleep status.
 *	触摸休眠状态回调。
 *
 *	@param 	sleeping 	YES if currently in touch-sleep mode.
 *	YES 表示当前处于触摸休眠模式。
 */
@property(nonatomic,copy,nullable)void(^touchSleepInfo)(BOOL sleeping);



/**
 *	@brief	Shared SDK manager singleton.
 *	SDK 管理器单例。
 *
 *	@return	The shared QCSDKManager instance.
 *	共享的 QCSDKManager 实例。
 */
+ (instancetype)shareInstance;

#pragma mark - Peripheral

/**
 *	@brief	Bind a connected CoreBluetooth peripheral to the SDK session.
 *	将已连接的 CoreBluetooth 外设绑定到 SDK 会话。
 *
 *	@param 	peripheral 	Connected CBPeripheral of the band/watch.
 *	已连接的手环/手表 CBPeripheral。
 *	@param 	finished 	Completion callback. YES if binding succeeded.
 *	完成回调。YES 表示绑定成功。
 */
- (void)addPeripheral:(CBPeripheral *)peripheral finished:(void (^)(BOOL))finished;

/**
 *	@brief	Unbind a peripheral from the SDK session.
 *	从 SDK 会话中解绑外设。
 *
 *	@param 	peripheral 	Peripheral previously added via addPeripheral:finished:.
 *	此前通过 addPeripheral:finished: 添加的外设。
 */
- (void)removePeripheral:(CBPeripheral *)peripheral;

/**
 *	@brief	Unbind all peripherals from the SDK session.
 *	从 SDK 会话中解绑全部外设。
 */
- (void)removeAllPeripheral;

#pragma mark - Measuring

/**
 *	@brief	Start a health measurement with the built-in default timeout.
 *	使用内置默认超时时间开始健康测量。
 *
 *	#### Default timeout by type (unit: seconds):
 *	#### 各类型默认超时时间（单位：秒）：
 *	- Most types: 30
 *	- 大多数类型：30
 *	- QCMeasuringTypeHRV: 80
 *	- QCMeasuringTypeHRV：80
 *
 *	#### Use the timeout overload when you need a custom duration (e.g. long PPG capture).
 *	#### 需要自定义时长（如长时间 PPG 采集）时，请使用带 timeout 参数的重载方法。
 *
 *	@param 	type 	Measurement type. See QCMeasuringType.
 *	测量类型，参见 QCMeasuringType。
 *	@param 	measuring 	Real-time value callback while measuring. Result type depends on type.
 *	测量过程中的实时数值回调。返回结果类型取决于测量类型。
 *	@param 	handle 	Final result callback.
 *	最终结果回调。
 *	                error.code: -1 start command failed, -2 end command failed,
 *	                -3 device not worn properly, -4 uncalibrated.
 *	                error.code：-1 发送开始指令失败，-2 发送结束指令失败，
 *	                -3 设备未正确佩戴，-4 未校准。
 */
- (void)startToMeasuringWithOperateType:(QCMeasuringType)type measuringHandle:(void(^)(id _Nullable result))measuring completedHandle:(void(^)(BOOL isSuccess,id _Nullable result,NSError * _Nullable error))handle;

/**
 *	@brief	Start a health measurement with a custom timeout.
 *	使用自定义超时时间开始健康测量。
 *
 *	#### Important: timeout unit is seconds. Passing a wrong unit/value may stop the
 *	measurement too early (no valid result) or keep the sensor running longer than expected.
 *	#### 重要：timeout 单位为秒。传错单位或数值可能导致测量过早结束（无有效结果），
 *	或传感器运行时间超出预期。
 *
 *	#### Recommended values:
 *	#### 推荐取值：
 *	- General measurements (HR / BP / SpO2 / stress / glucose / temperature): 30
 *	- 常规测量（心率 / 血压 / 血氧 / 压力 / 血糖 / 体温）：30
 *	- QCMeasuringTypeHRV: 80
 *	- QCMeasuringTypeHRV：80
 *	- QCMeasuringTypeHeartRateRaw / QCMeasuringTypeBloodOxygenRaw (PPG): 90 or larger;
 *	  for continuous long capture, pass a large value such as 36000
 *	- QCMeasuringTypeHeartRateRaw / QCMeasuringTypeBloodOxygenRaw（PPG）：90 或更大；
 *	  长时间连续采集可传较大值，例如 36000
 *
 *	@param 	type 	Measurement type. See QCMeasuringType.
 *	测量类型，参见 QCMeasuringType。
 *	@param 	timeout 	Measurement duration in seconds.
 *	                     Pass >= 0 to use this custom duration.
 *	                     Pass < 0 to fall back to the built-in default for the type
 *	                     (30 for most types, 80 for HRV, 90 for heart-rate raw PPG).
 *	测量时长，单位：秒。
 *	传 >= 0 使用该自定义时长。
 *	传 < 0 则回退到该类型的内置默认值
 *	（大多数类型 30，HRV 80，心率 PPG 原始数据 90）。
 *	@param 	measuring 	Real-time value callback while measuring. Result type depends on type.
 *	测量过程中的实时数值回调。返回结果类型取决于测量类型。
 *	@param 	handle 	Final result callback.
 *	最终结果回调。
 *	                error.code: -1 start command failed, -2 end command failed,
 *	                -3 device not worn properly, -4 uncalibrated.
 *	                error.code：-1 发送开始指令失败，-2 发送结束指令失败，
 *	                -3 设备未正确佩戴，-4 未校准。
 */
- (void)startToMeasuringWithOperateType:(QCMeasuringType)type timeout:(NSInteger)timeout measuringHandle:(void(^)(id _Nullable result))measuring completedHandle:(void(^)(BOOL isSuccess,id _Nullable result,NSError * _Nullable error))handle;

/**
 *	@brief	Stop an in-progress health measurement.
 *	停止正在进行的健康测量。
 *
 *	@param 	type 	Measurement type that was started. See QCMeasuringType.
 *	已开始的测量类型，参见 QCMeasuringType。
 *	@param 	handle 	Completion callback.
 *	完成回调。
 *	                error.code: -1 failed to send the end command.
 *	                error.code：-1 发送结束指令失败。
 */
- (void)stopToMeasuringWithOperateType:(QCMeasuringType)type completedHandle:(void(^)(BOOL isSuccess,NSError *error))handle;

/**
 *	@brief	Start wear calibration with the default timeout (120 seconds).
 *	使用默认超时时间（120 秒）开始佩戴校准。
 *
 *	@param 	handle 	Completion callback. isSuccess indicates whether calibration finished successfully.
 *	完成回调。isSuccess 表示校准是否成功完成。
 */
- (void)startToWearCalibrationWithCompletedHandle:(void(^)(BOOL isSuccess,NSError *error))handle;

/**
 *	@brief	Start wear calibration with a custom timeout.
 *	使用自定义超时时间开始佩戴校准。
 *
 *	@param 	timeout 	Calibration duration in seconds. Default / fallback is 120 when timeout <= 0.
 *	校准时长，单位：秒。当 timeout <= 0 时，默认/回退值为 120。
 *	@param 	handle 	Completion callback. isSuccess indicates whether calibration finished successfully.
 *	完成回调。isSuccess 表示校准是否成功完成。
 */
- (void)startToWearCalibrationWithTimeout:(NSInteger)timeout completedHandle:(void(^)(BOOL isSuccess,NSError *error))handle;

/**
 *	@brief	Stop an in-progress wear calibration.
 *	停止正在进行的佩戴校准。
 *
 *	@param 	handle 	Completion callback.
 *	完成回调。
 */
- (void)stopToWearCalibrationWithCompletedHandle:(void(^)(BOOL isSuccess,NSError *error))handle;


/// 获取当前SDK版本号
- (NSString *)getVersionInfo;
@end

NS_ASSUME_NONNULL_END
