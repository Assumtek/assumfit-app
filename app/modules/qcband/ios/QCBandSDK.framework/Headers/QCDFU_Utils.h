//
//  OdmDFU_Utils.h
//  OudmonBandV2
//
//  Created by ZongBill on 16/9/26.
//  Copyright © 2016年 ODM. All rights reserved.
//

#import <Foundation/Foundation.h>

/**
 *  @discussion 本接口适用于所有芯片在正常模式下的DFU升级功能, 如有其它nRF系列芯片需要使用, 请查阅芯片SDK文档, 确认是否适用, 在此不做保障
 */
@interface QCDFU_Utils : NSObject

extern NSString *const ODM_DFU_UUID_Service;              //服务UUID
extern NSString *const ODM_DFU_UUID_WriteCharacteristic;  //写入特征ID
extern NSString *const ODM_DFU_UUID_NotifyCharacteristic; //通知特征ID

extern NSString *const QCBandFeatureTemperature;
extern NSString *const QCBandFeatureDialMarket;
extern NSString *const QCBandFeatureMenstr; // menstrual cycle
extern NSString *const QCBandFeatureBloodOxygen; // blood oxygen
extern NSString *const QCBandFeatureDialCoordinate; // Support wallpaper dial setting coordinates
extern NSString *const QCBandFeatureBloodPressure; // 支持血压
extern NSString *const QCBandFeatureDrowsiness; // 支持疲劳度
extern NSString *const QCBandFeatureOneKeyMeasure; // 支持一键测量
extern NSString *const QCBandFeatureWeather;//支持天气
extern NSString *const QCBandFeatureQRCodeQQ; //不支持支持绑定QQ，wechat二维码
extern NSString *const QCBandFeatureDeviceWidth; // 宽度
extern NSString *const QCBandFeatureDeviceHeight; // 高度
extern NSString *const QCBandFeatureNewSleepProtocol; // 支持睡眠协议
extern NSString *const QCBandFeatureMaxDial; // 支持最大表盘数据
extern NSString *const QCBandFeatureContact; //支持通讯录
extern NSString *const QCBandFeatureMaxContacts;//支持最大通讯录个数
extern NSString *const QCBandFeatureManualHeartRate; //支持手动心率
extern NSString *const QCBandFeatureCard; // 支持名片功能
extern NSString *const QCBandFeatureLocation; //支持定位功能
extern NSString *const QCBandFeaturePointerDial; //指支持针表盘
extern NSString *const QCBandFeatureMusic; //支持音乐
extern NSString *const QCBandFeatureShowAutoBT;//支持自动连接
extern NSString *const QCBandFeatureEBook; //支持电子书
extern NSString *const QCBandFeatureAppManual;//App发起的手动测量
extern NSString *const QCBandFeatureBloodGlucose;//血糖
extern NSString *const QCBandFeatureMusicLRC; //歌词同步功能
extern NSString *const QCBandFeatureAblum; //相册功能
extern NSString *const QCBandFeatureMapNavi; //地图导航功能
extern NSString *const QCBandFeatureManualBloodOxygen; //手动血氧
extern NSString *const QCBandFeatureLowPower; //省电模式
extern NSString *const QCBandFeatureYaWei; //yawei手表(支持省电和表盘切换)
extern NSString *const QCBandFeatureUserProfile; //用户信息(用户名称+用户头像)
extern NSString *const QCBandFeatureDisableRecrod;
extern NSString *const QCBandFeatureBloodPressureCorrection;
extern NSString *const QCBandFeature4G; //4G手表
extern NSString *const QCBandFeatureImageMapNavi; //图片导航
extern NSString *const QCBandFeatureStress;//压力
extern NSString *const QCBandFeatureHRV;
extern NSString *const QCBandFeatureMSLPraise;//赞念
extern NSString *const QCBandFeatureWearCalibration; //佩戴校准
extern NSString *const QCBandFeatureSedentaryReminder; //久坐提醒
extern NSString *const QCBandFeatureTouchControl; //触摸控制
extern NSString *const QCBandFeatureGestureControl; //戒指手势
extern NSString *const QCBandFeatureGestureControlMusic; //戒指(手势/触摸)音乐
extern NSString *const QCBandFeatureGestureControlVideo; //戒指(手势/触摸)视频
extern NSString *const QCBandFeatureGestureControlEBook; //戒指(手势/触摸)电子书
extern NSString *const QCBandFeatureGestureControlTakePhoto; //戒指(手势/触摸)拍照
extern NSString *const QCBandFeatureGestureControlPhoneCall; //戒指(手势/触摸)接电话
extern NSString *const QCBandFeatureGestureControlGame; //戒指(手势/触摸)游戏
extern NSString *const QCBandFeatureGestureControlHRMeasure;//戒指(手势/触摸)心率测量
extern NSString *const QCBandFeatureTouchControlOfScreenDevice;//带屏幕的戒指
extern NSString *const QCBandFeatureFlipWrist;//戒指左右手佩戴
extern NSString *const QCBandFeatureTemperatureInterval; //自动温度测量支持间隔修改
extern NSString *const QCBandFeatureHRVInterval; //自动HRV测量支持间隔修改
extern int const ODM_DEFAULT_DFU_PACKET_SIZE;
extern int ODM_DFU_PACKET_SIZE;

typedef enum {
    ODM_DFU_FileExtensionHex,
    ODM_DFU_FileExtensionBin,
    ODM_DFU_FileExtensionZip
} ODM_DFU_FileExtension;

typedef enum {
    ODM_DFU_Operation_StartDfuRequest = 0x01,                    //启动固件升级
    ODM_DFU_Operation_InitializeDfuParametersRequest = 0x02,     //发送固件信息
    ODM_DFU_Operation_ReceiveFirmwareImageRequest = 0x03,        //接收固件
    ODM_DFU_Operation_ValidateFirmwareRequest = 0x04,            //校验固件
    ODM_DFU_Operation_ActivateAndResetRequest = 0x05,            //激活固件并重启
    ODM_DFU_Operation_CheckStatus = 0x06,                        //检查固件升级状态
    ODM_DFU_Operation_InitializeResourceParameterRequest = 0x21, //发送资源信息
    ODM_DFU_Operation_ReceiveResourceDataRequest = 0x22,         //接收资源数据
    ODM_DFU_Operation_ValidateResourceRequest = 0x23,            //校验资源内容
    ODM_DFU_Operation_DeleteResourceRequest = 0x24,              //删除指定资源
    ODM_DFU_Operation_TemperatureListRequest = 0x25,             //获取定时体温数据
    ODM_DFU_Operation_ManualTemperatureListRequest = 0x26,       //获取手动体温数据
    ODM_DFU_Operation_SleepList = 0x27,                         //获取睡眠数据
    ODM_DFU_Operation_ManualHeartRate = 0x28,                   //获取手动心率
    ODM_DFU_Operation_LongContacts = 0x29,                      //设置长通讯录(20个以上)
    ODM_DFU_Operation_BloodOxygenListRequest = 0x2A,            //获取手动血氧数据
    ODM_DFU_Operation_AlarmResponse = 0xFF,                      //获取和设置闹钟
    ODM_DFU_Operation_Location = 0x20,                         //设置经纬度
    ODM_DFU_Operation_AlarmInfo = 0x2C,                         //获取和设置闹钟
    ODM_DFU_Operation_Contacts = 0x2D,                         //获取和设置通讯录
    ODM_DFU_Operation_PhoneBindName = 0x2E,                      //获取电话绑定的设备名称
    ODM_DFU_Operation_QRCodeInfo = 0x2F,                        //设置(获取)名片二维码的URL
    ODM_DFU_Operation_FileRequest = 0x30,                        //查询缺失文件
    ODM_DFU_Operation_FileInit = 0x31,                           //启动缺失文件传输
    ODM_DFU_Operation_FilePacket = 0x32,                         //发送缺失文件
    ODM_DFU_Operation_FileCheck = 0x33,                          //校验缺失文件
    ODM_DFU_Operation_DialFileList = 0x35,                           //表盘文件列表
    ODM_DFU_Operation_DialFileInit = 0x36,                           //启动表盘文件传输
    ODM_DFU_Operation_DialFilePacket = 0x37,                         //发送表盘文件
    ODM_DFU_Operation_DialFileCheck = 0x38,                          //校验表盘文件
    ODM_DFU_Operation_DialFileDelete = 0x39,                         //删除表盘文件
    ODM_DFU_Operation_DialParameter = 0x3A,                       //壁纸表盘设置参数
    ODM_DFU_Operation_DataSummaryRequest = 0x41,                 //获取运动+概要请求
    ODM_DFU_Operation_DataSummaryResponse = 0x42,                //获取运动+概要回复
    ODM_DFU_Operation_DataRequest = 0x43,                        //获取运动+数据请求
    ODM_DFU_Operation_DataDetailSummaryResponse = 0x44,          //获取运动+数据概要回复
    ODM_DFU_Operation_DataDetailResponse = 0x45,                 //获取运动+数据细节回复
    ODM_DFU_Operation_DataDetailChecked = 0x46,                  //运动+数据接收确认
    ODM_DFU_Operation_BloodGlucoseListRequest = 0x47,            //获取手动血糖数据
    ODM_DFU_Operation_MapNavi = 0x48,                           //上报导航数据
    ODM_DFU_Operation_ManualBloodOxygen = 0x49,                  //手动血氧
    ODM_DFU_Operation_SetUserProfile = 0x4A,                    //设置用户信息(用户名称+用户头像)
    ODM_DFU_Operation_OnlineAGPSRequest = 0x54,                  //请求在线AGPS数据
    ODM_DFU_Operation_GetSedentaryReminder = 0x5B,                //久坐提醒
    ODM_DFU_Operation_BloodOxygenIntervalListRequest = 0x5F,      //获取手动血氧数据
    ODM_DFU_Operation_TemperatureIntervalListRequest = 0x74,      //获取手动温度数据
    ODM_DFU_Operation_ECGListRequest = 0x70,                    //心电数据列表请求
    ODM_DFU_Operation_ECGListResponse = 0x71,                   //心电数据列表回复
    ODM_DFU_Operation_ECGDataRequest = 0x72,                    //心电详细数据请求
    ODM_DFU_Operation_ECGDataResponse = 0x73,                   //心电详细数据回复
    ODM_DFU_Operation_MSLPrayer = 0x7a,                         //穆斯林赞念
    ODM_DFU_Operation_OtherDataRequest = 0x7B,                  //其他数据获取(压力/情绪)
    ODM_DFU_Operation_QueryFiles = 0x80,                        //文件(音乐，电子书)列表查询
    ODM_DFU_Operation_DeleteFile = 0x81,                        //删除文件(音乐，电子书)列表
    ODM_DFU_Operation_GetAudio = 0x82,                        //获取音频文件
    ODM_DFU_Operation_OneMinuHeartRateRequest = 0x75,            //心率一分钟数据

} ODM_DFU_Operation;

typedef enum {
    ODM_DFU_Operation_FileInit_Add = 0x01,
    ODM_DFU_Operation_FileInit_Delete = 0x02,
    ODM_DFU_Operation_FileInit_Music = 0x03,
    ODM_DFU_Operation_FileInit_ebook = 0x04
} ODM_DFU_Operation_FileInit_Code;

typedef enum {
    QC_Operation_File_Music = 0x01, //音乐
    QC_Operation_File_Ebook = 0x02, //电子书
    QC_Operation_File_Record = 0x03  //录音
} QC_Operation_File_Code; //文件操作类型

typedef enum {
    ODM_DFU_OperationStatus_SuccessfulResponse = 0x00,
    ODM_DFU_OperationStatus_WrongDataLengthResponse = 0X01,
    ODM_DFU_OperationStatus_InvalidDataResponse = 0x02,
    ODM_DFU_OperationStatus_WrongCommandStageResponse = 0x03,
    ODM_DFU_OperationStatus_InvalidCommandParameterResponse = 0x04,
    ODM_DFU_OperationStatus_DeviceInternalErrorResponse = 0x05,
    ODM_DFU_OperationStatus_NotEnoughPowerResponse = 0x06,
    ODM_DFU_OperationStatus_DialFileOverwhelmingResponse = 0x07
} ODM_DFU_OperationStatus;

typedef NS_ENUM(NSUInteger, ODM_DFU_Device_Process_Status) {
    ODM_DFU_Device_Process_Status_Free = 0x00,
    ODM_DFU_Device_Process_Status_ReadyToUpdate = 0x01,
    ODM_DFU_Device_Process_Status_ParameterInited = 0x02,
    ODM_DFU_Device_Process_Status_FirmwareReceiving = 0x03,
    ODM_DFU_Device_Process_Status_FirmwareValidated = 0x04,
    ODM_DFU_Device_Process_Status_NotKnown = 0x05
};

typedef enum {
    ODM_DFU_FirmwareType_Application = 0x01, //应用程序
    ODM_DFU_FirmwareType_Bootloader = 0x02,  //启动驱动
    ODM_DFU_FirmwareType_Softdevice = 0x03,  //硬件驱动
} ODM_DFU_FirmwareType;

typedef enum {
    ODM_DFU_BandType_TwoBand = 0x00, //"双页"升级模式
    ODM_DFU_BandType_OneBand = 0x01, //"单页"升级模式
} ODM_DFU_BandType;

typedef enum {
    ODM_RES_ResourceType_Default = 0x00, //默认, 即无资源
    ODM_RES_ResourceType_Image = 0x01,   //图片
    ODM_RES_ResourceType_Text = 0x02,    //文字
} ODM_RES_ResourceType;

typedef enum {
    ODM_RES_UIType_StandBy = 0x01,  //待机资源
    ODM_RES_UIType_Boot = 0x02,     //开机资源
    ODM_RES_UIType_ShutDown = 0x03, //关机资源
    ODM_RES_UIType_All = 0xFF       //全部资源
} ODM_RES_UIType;

typedef enum {
    QC_QRCODE_INFO_WeChat = 0,
    QC_QRCODE_INFO_QQ,
    QC_QRCODE_INFO_Facebook,
    QC_QRCODE_INFO_Twitter,
    QC_QRCODE_INFO_Whatsapp,
    QC_QRCODE_INFO_Instagram,
    QC_QRCODE_INFO_Tiktok,
    QC_QRCODE_DELETE_WeChat = 0x80,
    QC_QRCODE_DELETE_QQ,
    QC_QRCODE_DELETE_Facebook,
    QC_QRCODE_DELETE_Twitter,
    QC_QRCODE_DELETE_Whatsapp,
    QC_QRCODE_DELETE_Instagram,
    QC_QRCODE_DELETE_Tiktok,
    QC_QRCODE_DELETE_Enable = 0xFF,
} QC_QRCODE_INFO_TYPE;

typedef NS_ENUM(NSInteger, QC_FILTER_APP_TYPE) {
    QC_FILTER_TYPE_PHONE = 0,
    QC_FILTER_TYPE_SMS,
    QC_FILTER_TYPE_QQ,
    QC_FILTER_TYPE_Wechat,
    QC_FILTER_TYPE_Facebook,
    QC_FILTER_TYPE_WhatsApp,
    QC_FILTER_TYPE_Twitter,
    QC_FILTER_TYPE_Skype,
    QC_FILTER_TYPE_Line = 10,
    QC_FILTER_TYPE_LinkedIn,
    QC_FILTER_TYPE_Instagram,
    QC_FILTER_TYPE_TIM,
    QC_FILTER_TYPE_Snapchat,
    QC_FILTER_TYPE_Other1,
    QC_FILTER_TYPE_Other2,
    QC_FILTER_TYPE_Others,
    QC_FILTER_TYPE_Messenger = 20,
    QC_FILTER_TYPE_Zalo,
    QC_FILTER_TYPE_KakaoTalk,
    QC_FILTER_TYPE_Telegram,
    QC_FILTER_TYPE_Viber,
    QC_FILTER_TYPE_Signal,
    QC_FILTER_TYPE_Zoom,
    QC_FILTER_TYPE_KiKMessage,
    QC_FILTER_TYPE_IMessage = 30,
    QC_FILTER_TYPE_Tinder,
    QC_FILTER_TYPE_Tumblr,
    QC_FILTER_TYPE_Bumble,
    QC_FILTER_TYPE_Discord,
    QC_FILTER_TYPE_GoogleMeet,
    QC_FILTER_TYPE_ShareChat,
    QC_FILTER_TYPE_Moj,
    QC_FILTER_TYPE_Tiktok = 40,
    QC_FILTER_TYPE_Youtube,
    QC_FILTER_TYPE_Gmail,
};

typedef enum {
    QCBandRealTimeHeartRateCmdTypeStart = 0x01,//Start real-time heart rate measurement
    QCBandRealTimeHeartRateCmdTypeEnd,//End real-time heart rate measurement
    QCBandRealTimeHeartRateCmdTypeHold,//Continuous heart rate test (for continuous measurement to keep alive)
} QCBandRealTimeHeartRateCmdType;

typedef NS_ENUM(NSInteger, SchedualInfoType) {
    SchedualInfoTypeBloodGlucose = 0x00,    //血糖
    SchedualInfoTypeBloodLipids,            //血脂
    SchedualInfoTypeUricAcid,               //尿酸
    SchedualInfoTypeBodyTemperator,         //体温
    SchedualInfoTypeRRI,                    //RRI
    SchedualInfoTypeEmotion = 0x05,         //情绪
};


typedef NS_ENUM(NSInteger, QC_RING_CONTROL_TYPE) {
    QC_RING_CONTROL_TYPE_TOUCH = 0, //触摸
    QC_RING_CONTROL_TYPE_GESTURE = 0, //手势
}; //戒指控制


//错误相关
extern NSString *const kOdmDFUErrorDomain;
extern NSString *const kOdmDFUErrorMessageKey;
extern NSString *const kOdmDFUErrorStatusCodeKey;

typedef NS_ENUM(NSUInteger, ODM_DFU_Error_Code) {
    ODM_DFU_Error_Code_ChannelBusy = 1001,
    ODM_DFU_Error_Code_NotifyTimeOut,
    ODM_DFU_Error_Code_InvalidParameter,
    ODM_DFU_Error_Code_ResponseTypeNotCorrect
};

typedef NS_ENUM(NSUInteger, QC_File_Error_Code) {
    QC_File_Error_Code_Success = 0,
    QC_File_Error_Code_Size,
    QC_File_Error_Code_Data,
    QC_File_Error_Code_State,
    QC_File_Error_Code_Format,
    QC_File_Error_Code_Flash_Operate,
    QC_File_Error_Code_Lower_Power,
    QC_File_Error_Code_Memory_Full,
};

typedef NS_ENUM(NSInteger, QCDeviceDataUpdateReport) {
    /// 0x01 Heart rate data updated. 心率数据更新。
    QCDeviceDataUpdateHeartRate = 0x01,
    /// 0x02 Blood pressure data updated. 血压数据更新。
    QCDeviceDataUpdateBloodPressure = 0x02,
    /// 0x03 Blood oxygen data updated. 血氧数据更新。
    QCDeviceDataUpdateBloodOxygen = 0x03,
    /// 0x04 Legacy step detail changed; use QCDeviceDataUpdateStepInfo. 计步详情改变(旧版)。
    QCDeviceDataUpdateStep = 0x04,
    /// 0x05 Body temperature single measurement completed. 体温单次测量完成。
    QCDeviceDataUpdateTemperature = 0x05,
    /// 0x06 Sleep data updated. 睡眠数据更新。
    QCDeviceDataUpdateSleep = 0x06,
    /// 0x07 Sport record updated. 运动记录更新。
    QCDeviceDataUpdateSportRecord = 0x07,
    /// 0x08 Alarm settings changed. 闹钟设置变更。
    QCDeviceDataUpdateAlarm = 0x08,
    /// 0x09 Do-not-disturb settings changed. 勿扰设置变更。
    QCDeviceDataUpdateDoNotDisturb = 0x09,
    /// 0x0A Audio recording changed. 录音变更。
    QCDeviceDataUpdateAudioRecord = 0x0A,
    /// 0x0B 12/24-hour format changed. 12/24 小时制变更。
    QCDeviceDataUpdateHourly = 0x0B,
    /// 0x0C Battery changed; use currentBatteryInfo for charging. 电量变化。
    QCDeviceDataUpdatePower = 0x0C,
    /// 0x0D Blood glucose data updated. 血糖数据更新。
    QCDeviceDataUpdateLowBloodSugar = 0x0D,
    /// 0x0E Current watch face changed; dataValue = dial index (0-N). 当前表盘更改。
    QCDeviceDataUpdateDialIndex = 0x0E,
    /// 0x0F Low-power mode changed; dataValue 0=off, 1=on. 省电模式开关。
    QCDeviceDataUpdateLowPower = 0x0F,
    /// 0x10 Goal changed. 目标变更。
    QCDeviceDataUpdateGoal = 0x10,
    /// 0x11 Raise-to-wake / wearing; use flipWristInfo. 抬腕/佩戴信息。
    QCDeviceDataUpdateRaiseToWake = 0x11,
    /// 0x12 Step, calorie, distance increased; use currentStepInfo. 计步/卡路里/距离增加。
    QCDeviceDataUpdateStepInfo = 0x12,
    /// 0x13 Blood lipids data updated. 血脂数据更新。
    QCDeviceDataUpdateBloodLipids = 0x13,
    /// 0x14 Uric acid data updated. 尿酸数据更新。
    QCDeviceDataUpdateUricAcid = 0x14,
    /// 0x15 Emotion data updated. 情绪数据更新。
    QCDeviceDataUpdateEmotion = 0x15,
    /// 0x20 GPS data updated. GPS 数据更新。
    QCDeviceDataUpdateGPS = 0x20,
    /// 0x21 Stock data request/update. 股票数据。
    QCDeviceDataUpdateStock = 0x21,
    /// 0x22 GPT session event; dataValue 0=start, 1=normal end, 2=abnormal end. GPT 开始/结束。
    QCDeviceDataUpdateGPT = 0x22,
    /// 0x23 Theme layout changed; dataValue 0=list, 1=grid. 主题设置上报。
    QCDeviceDataUpdateTheme = 0x23,
    /// 0x24 Button setting changed. 操作按钮设置上报。
    QCDeviceDataUpdateButtonSetting = 0x24,
    /// 0x25 Prayer (MSL) tap count report. 赞念(穆斯林)点击上报。
    QCDeviceDataUpdatePrayer = 0x25,
    /// 0x26 Camera live control; dataValue 0=live preview, 1=photo result. 相机实时显示控制。
    QCDeviceDataUpdateCameraLive = 0x26,
    /// 0x27 Auto temperature offset report; dataValue = offset from 32°C. 自动体温数据更新。
    QCDeviceDataUpdateAutoTemperature = 0x27,
    /// 0x28 Touch/gesture control state; use gestureAndTouchInfo. 触摸/手势开关状态。
    QCDeviceDataUpdateTouchControl = 0x28,
    /// 0x29 Game event; dataValue 1=click. 游戏事件上报。
    QCDeviceDataUpdateGame = 0x29,
    /// 0x2A Touch sleep state; use touchSleepInfo. 触摸休眠状态。
    QCDeviceDataUpdateTouchSleep = 0x2A,
    /// 0x2B HRV data updated. HRV 数据更新。
    QCDeviceDataUpdateHRV = 0x2B,
    /// 0x2C Stress data updated. 压力数据更新。
    QCDeviceDataUpdateStress = 0x2C,
    /// 0x2D Custom key triggered; dataValue 1=swipe down, 2=swipe up, 3=click, 4=long press. 自定义按键触发。
    QCDeviceDataUpdateCustomKey = 0x2D,
    /// 0x2E Ultraviolet data updated. 紫外线数据更新。
    QCDeviceDataUpdateUltraviolet = 0x2E,
    /// 0x2F SOS event. SOS 上报。
    QCDeviceDataUpdateSOS = 0x2F,
    /// 0x30 Couple feature event; dataValue 1=double-click. 情侣功能事件。
    QCDeviceDataUpdateCoupleEvent = 0x30,
    /// 0x31 Sport heart-rate alert. 运动心率预警。
    QCDeviceDataUpdateSportHeartRateAlert = 0x31,
    /// 0x32 Drink reminder. 喝水提醒。
    QCDeviceDataUpdateDrinkReminder = 0x32,
    /// 0x33 Sedentary reminder. 久坐提醒。
    QCDeviceDataUpdateSedentaryReminder = 0x33,
    /// 0x34 Alarm reminder fired. 闹钟提醒。
    QCDeviceDataUpdateAlarmReminder = 0x34,
    /// 0x35 Tri-axis activity in sleep; dataValue = activity amount. 三轴活动睡眠状态上报。
    QCDeviceDataUpdateTriAxisActivitySleep = 0x35,
    /// 0x36 Heart-rate wear status; dataValue 1=worn, 2=removed. 心率佩戴状态。
    QCDeviceDataUpdateHeartRateWearStatus = 0x36,
    /// 0x37 Device-side heart-rate result; dataValue = BPM. 设备端心率测量结果。
    QCDeviceDataUpdateDeviceHeartRateResult = 0x37,
    /// 0x38 Custom MSL praise count (big-endian BB CC). 穆斯林自定义赞念。
    QCDeviceDataUpdateMuslimCustomPraise = 0x38,
    /// 0x39 Menstrual cycle reminder; dataValue 1=period, 2=ovulation. 生理周期提醒。
    QCDeviceDataUpdateMenstrualCycle = 0x39,
    /// 0x3A Auto heart-rate alarm; dataValue 1=low HR, 2=high HR. 自动心率报警。
    QCDeviceDataUpdateHeartRateAlarm = 0x3A,
    /// 0x3B One-minute interval auto temperature; dataValue = first temp × 100. 一分钟间隔自动温度。
    QCDeviceDataUpdateOneMinuteTemperature = 0x3B,
    /// 0x3C Couple detail event; see QCNotificationEventType. 情侣具体事件。
    QCDeviceDataUpdateCoupleDetailEvent = 0x3C,
    /// 0x3D High temperature alarm; dataValue = temp × 100 (little-endian). 温度高报警。
    QCDeviceDataUpdateHighTemperatureAlarm = 0x3D,
    /// 0x3E Ring find-phone data request (screen & idle time). 戒指找手机要数据。
    QCDeviceDataUpdateRingFindPhone = 0x3E,
    /// 0x3F ECG lead status; dataValue 0=unsupported, 1=connected, 2=disconnected. ECG 导联状态。
    QCDeviceDataUpdateECGLeadStatus = 0x3F,
    /// 0x40 Device-side blood oxygen result; dataValue = SpO2. 设备端血氧测量结果。
    QCDeviceDataUpdateDeviceBloodOxygenResult = 0x40,
    /// 0xCF Audio playback control; dataValue 1=end, 2=pause, 3=exit. 音频播放控制。
    QCDeviceDataUpdateAudioPlayback = 0xCF,
    /// 0xD0 WiFi OTA progress. WiFi OTA 升级进度。
    QCDeviceDataUpdateWiFiOTAProgress = 0xD0,
    /// 0xD1 Recording file count changed. 录音文件数量变更。
    QCDeviceDataUpdateRecordingFileCount = 0xD1,
};

/// Human-readable enum name for logging, e.g. "HeartRate(0x01)". 便于集成方日志识别的类型名称。
FOUNDATION_EXPORT NSString * _Nonnull QCDeviceDataUpdateReportName(QCDeviceDataUpdateReport type);

/// Brief description of dataValue semantics for the given report type. 该类型的 dataValue 含义说明。
FOUNDATION_EXPORT NSString * _Nonnull QCDeviceDataUpdateReportValueHint(QCDeviceDataUpdateReport type);

typedef enum {
    QCSportStateStart = 0x01, //开始
    QCSportStatePause = 0x02,  //暂停
    QCSportStateContinue = 0x03,  //继续
    QCSportStateStop = 0x04,  //结束
    QCSportStateRunning = 0x05,  //运动中
    QCSportStateGetTime = 0x06,  //获取运动开始时间
} QCSportState;

typedef NS_ENUM(NSInteger, QCTouchGestureControlType) {
    QCTouchGestureControlTypeOff = 0x00, //关闭
    QCTouchGestureControlTypeMusic,//音乐
    QCTouchGestureControlTypeVideo,//短视频(Tiktok等等)
    QCTouchGestureControlTypeMSLPraise,//赞念(穆斯林)
    QCTouchGestureControlTypeEBook,//电子书
    QCTouchGestureControlTypeTakePhoto,//拍照
    QCTouchGestureControlTypePhoneCall,//接听电话
    QCTouchGestureControlTypeGame,//游戏
    QCTouchGestureControlTypeHRMeasure,//心率测量
    QCTouchGestureControlTypeTouchEvent //TouchEvent
};

typedef NS_ENUM(NSInteger, QCNotificationEventType) {
    QCNotificationEventTypeDoubleClick = 1,       //双击按键事件通知
    QCNotificationEventTypePairing = 2,           //配对事件通知
    QCNotificationEventTypeMissYou = 3,           //我想你
    QCNotificationEventTypeLoveYou = 4,           //我爱你
    QCNotificationEventTypeNeedYou = 5,           //需要你
    QCNotificationEventTypeSad = 6,               //伤心
    QCNotificationEventTypeCustomLight = 8,       //自定义亮灯
    QCNotificationEventTypeCustomVibration = 9,   //自定义震动
};

typedef NS_ENUM(NSInteger, QCNotificationLightAction) {
    QCNotificationLightActionNull = 0,   //NULL
    QCNotificationLightActionStop = 1,     //停止
    QCNotificationLightActionGreen = 2,    //绿灯
    QCNotificationLightActionRed = 3,      //红灯
};

typedef NS_ENUM(NSInteger, QCNotificationVibrationAction) {
    QCNotificationVibrationActionNull = 0,   //NULL
    QCNotificationVibrationActionStop = 1,     //停止
    QCNotificationVibrationActionStart = 2,    //启动
};

typedef NS_ENUM(NSInteger, QCOtherDataType) {
    QCOtherDataTypeNull = 0,
    QCOtherDataTypePressure = 1,     //压力数据
    QCOtherDataTypeEmotion = 2,      //情绪数据
};
 
typedef NS_ENUM(NSInteger, QCEmotionStatus) {
    QCEmotionStatusNull = 0,
    QCEmotionStatusExcited = 1,      //兴奋
    QCEmotionStatusHappy = 2,        //开心
    QCEmotionStatusPleasant = 3,     //愉悦
    QCEmotionStatusCalm = 4,         //平静
    QCEmotionStatusNervous = 5,       //紧张
    QCEmotionStatusConfused = 6,     //困惑
    QCEmotionStatusChallenged = 7,   //挑战
    QCEmotionStatusUncomfortable = 8,//不舒服
    QCEmotionStatusSad = 9,          //伤心
    QCEmotionStatusAnxious = 10,     //焦虑
};

+ (NSArray *)getFirmwareTypes;
+ (NSString *)stringFileExtension:(ODM_DFU_FileExtension)fileExtension;

+ (NSData *)packageData:(NSData *)data type:(UInt8)type;
+ (UInt16)packageDataLength:(NSData *)data;
+ (NSData *)unpackData:(NSData *)data;

+ (NSString *)errorWithRetType:(ODM_DFU_OperationStatus)typeCode;
+ (NSString *)getLocalizedTimeOutMessage;

@end
