export default {
  backendManagement: '后台管理',
  runningStatus: '运行状态',
  devices: {
    title: '设备',
    runStatus: {
      offline: '离线',
      online: '在线',
      abnormal: '异常'
    },
    workStatus: {
      close: '关闭',
      open: '开启'
    },
    userName: '设备账号',
    password: '设备密码'
  },
  deviceName: '设备名称',
  deviceType: '设备类型',
  deviceStatus: '设备状态',
  deviceArea: '设备区域',
  deviceIP: '设备IP',
  devicePort: '设备端口',
  deviceNum: '设备编号',
  longitudeAndLatitude: '经纬度',
  batteryCode: '电池编号',
  confirmOpenPower$: '请确认是否开启设备「{name}」的电源？',
  confirmClosePower$: '请确认是否关闭设备「{name}」的电源？',
  panoramaChannel: '{n}通道',
  composableCharts: {
    targetSliceList: {
      time: '时间',
      device: '设备',
      size: '大小',
      dangerLevel: '危险等级',
      timeOptions: {
        last10minutes: '近10分钟',
        last1hour: '近1小时',
        before1hour: '1小时之前'
      },
      targetSizeOptions: {
        all: '全选',
        point: '点目标',
        area: '面目标'
      }
    }
  }
}
