<template>
  <div class="canvas-view" style="height: 100%; width: 100%;overflow: hidden;">
    <a-watermark :content="watermark" style="height: 100%;background-color: #63718B;">
      <canvas id="canvasRender"></canvas>
      <div v-if="showCard" class="mask" @click="showCard = false"> </div>
      <div class="top" :style="showCard ? 'bottom: 82vh;' : 'bottom: 42vh'">
        <button v-if="!showCard" class="top-btn unfold-btn" @click="onUnfoldClick"> </button>
        <button v-if="showCard" class="top-btn fold-btn" @click="onFoldClick"> </button>
      </div>

      <div class="bottom-card" :style="showCard ? 'bottom: 0;' : 'bottom: -40vh;'">
        <div class="building-box">
          <button class="allBuilding-btn" v-if="selectBuildNumber != ''" @click="onAllBuildingClick"> 全部楼栋 </button>
          <div class="buildNumber-terms" id='nav'>
            <van-button class="btn" :class="{ active: selectBuildNumber === item }" plain type="default"
              v-for="(item, index) in buildNumbers" :key="index" :id="'button-' + index"
              @click="choseBuildNumber(item)">{{
                item + ' #' }}</van-button>
          </div>
        </div>
        <div class="table-container">
          <table class="floor-unit-table" v-if="fieldViewData.find(item => item.buildingNumber === tableBuildNumber)">
            <thead class="header">
              <tr>
                <th style="width: 32px; max-width: 40px; min-width: 20px;"></th>
                <th :colspan="getRoomsByUnit(tableBuildNumber, unit)" v-for="unit in units" :key="unit"> {{ unit }} 单元</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="floor in Array.from({ length: totalFloor }, (_, i) => totalFloor - i)" :key="floor">
                <td style="font-size: 14px;">{{ floor }}层</td>
                <td v-for="(item, index) in getRoomsByAFloor(units)" :key="index">
                  <div
                  :class=" selectCellKey === getSelectCellKey(tableBuildNumber, floor, item.unit, item.room) ? 'table-cell-active' : 'table-cell'"
                  :style="getTableCellStyle(getFieldTableData(tableBuildNumber, floor, item.unit, item.room))"
                  @click="showFieldView(tableBuildNumber, floor, item.unit, item.room)">
                    {{ getHouseNumber(floor, item.room) }} <br>
                    <span class="field-data">
                      {{ getFieldTableData(tableBuildNumber, floor, item.unit, item.room) }}㎡
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          {{ fieldViewData.find(item => item.buildingNumber === tableBuildNumber) ? '' : '暂无视野范围数据' }}
        </div>
      </div>
    </a-watermark>
  </div>
</template>

<script>
import fieldViewOpen from "./fieldViewOpen";
import { getCommunityDetail, getFieldData, isMember, getResidentialByCode, getRoadByCode} from '@/utils/api'
// import utils from '@/utils/index'
import { Modal } from 'ant-design-vue';
// import * as echarts from 'echarts';

let fieldView = null;

export default {
  name: "ResidentialSunShine",
  props: {
    msg: String,
  },
  data() {
    return {
      showCard: false,
      firstFieldMap: new Map(),
      fieldDataMap: new Map(),
      houseRoomMap: new Map(),
      tableBuildNumber: '',
      units: 0,
      totalFloor: 0,
      buildNumbers: [],
      residenceData: [],
      fieldViewData: [],
      selectCellKey: '',
      watermark: [],
      residentialName: ''
    }
  },

  mounted() {
    document.title = "采光分析大师";
    let code = this.$route.params.code;

    getResidentialByCode(code).then((res) => {
      if (res.data.code == 200) {
        this.residentialName = res.data.result.residentialName;
      }
    })

    // 判断用户是否是会员
    isMember(code).then((res) => {
      if (res.data.result != null && res.data.result.businessMemberType != 2) {
        this.watermark = ['采光分析大师', '秦皇岛三角龙科技有限公司'];
        document.title = this.residentialName;
      }
      if (res.data.result == null) {
        this.watermark = ['采光分析大师', '秦皇岛三角龙科技有限公司'];
      }
    })
    getCommunityDetail(code).then((res) => {
      if (res.data.code == 200) {
        let result = res.data.result;
        result.barrierReqList.forEach(element => {
          if (element.houseList.length > 0) {
            this.buildNumbers.push(element.buildingNumber);
            this.firstFieldMap.set(element.buildingNumber, {
              buildingNumber: element.buildingNumber,
              floor: element.totalFloor,
              unit: element.houseList[0].unit,
              room: element.houseList[0].room
            })
          }
          this.residenceData.push({
            buildingNumber: element.buildingNumber,
            units: element.units,
            totalFloor: element.totalFloor
          })
        });
        // 对 buildNumbers 进行排序
        this.buildNumbers.sort((a, b) => {
          const isANumber = !isNaN(parseFloat(a)) && isFinite(a);
          const isBNumber = !isNaN(parseFloat(b)) && isFinite(b);
          if (isANumber && isBNumber) {
            return parseFloat(a) - parseFloat(b);
          } else if (isANumber) {
            return -1;
          } else if (isBNumber) {
            return 1;
          }
          return a.localeCompare(b);
        })
        this.tableBuildNumber = this.buildNumbers[0];
        this.selectBuildNumber = this.buildNumbers[0];

        getRoadByCode(code).then((res) => {
          if (res.data.code == 200) {
            result.roadList = res.data.result;
          }
          fieldView = new fieldViewOpen({
            element: document.querySelector("#canvasRender"),
            history: result,
            onChoseBuildNumber: this.onChoseBuildNumber
          })
          fieldView.init()
          this.getFieldData(code)
        })
      } else {
        Modal.error({
          title: '提示',
          content: res.data.message || '请求失败',
        })
      }
    })
  },

  methods: {
    onUnfoldClick() {
      this.showCard = true;
    },

    onFoldClick() {
      this.showCard = false;
    },

    getFieldData (code) {
      getFieldData(code).then((res) => {
        if (res.data.code == 200) {
          this.fieldViewData = res.data.result
          if( this.fieldViewData != null){
            this.units = this.residenceData.find(item => item.buildingNumber === this.tableBuildNumber).units
            this.totalFloor = this.residenceData.find(item => item.buildingNumber === this.tableBuildNumber).totalFloor;
          }
          this.fieldDataFormat(this.fieldViewData)
          fieldView.initFieldSizeColor(this.fieldViewData)
          fieldView.switchBuilding(this.buildNumbers[0])
        }
      })
    },

    fieldDataFormat(fieldDataList) {
      fieldDataList.forEach(fieldData => {
        let room = Number(fieldData.room)
        if (room < 10) {
          room = "0" + room;
        }
        let fieldDataKey = fieldData.buildingNumber + "_"
        + fieldData.floorNumber + "_"
        + fieldData.unit + "_"
        + room
        this.fieldDataMap.set(fieldDataKey,fieldData.fieldSize)
        let key = fieldData.buildingNumber + fieldData.unit
        let roomArr = []
        if (this.houseRoomMap.has(key)) {
            roomArr = this.houseRoomMap.get(key)
          }
          if(!roomArr.includes(Number(fieldData.room))){
            roomArr.push(Number(fieldData.room))
            this.houseRoomMap.set(key,roomArr)
          }
        })
        for (let [key, value] of this.houseRoomMap) {
          value.sort((a, b) => a - b)
          this.houseRoomMap.set(key,value)
        }
    },

    choseBuildNumber(number) {
      fieldView.switchBuilding(number)
    },

    onChoseBuildNumber(number) {
      this.selectBuildNumber = number;
      this.tableBuildNumber = number;
      let firstFieldData = this.firstFieldMap.get(number)
      let room = Number(firstFieldData.room)
      if (room < 10) {
        room = '0' + room
      }
      let key = firstFieldData.buildingNumber + "_"
      + firstFieldData.floor + "_"
      + firstFieldData.unit + "_"
      + room
      this.selectCellKey = key
      fieldView.showFieldViewForHouse(key)

      this.units = this.residenceData.find(item => item.buildingNumber === this.tableBuildNumber).units;
      this.totalFloor = this.residenceData.find(item => item.buildingNumber === this.tableBuildNumber).totalFloor;
    },

    getRoomsByUnit(building, unit) {
      let key = building + unit
      let roomArr = this.houseRoomMap.get(key)
      if(roomArr == null){
        return 0
      }
      return roomArr.length
    },

    getRoomsByAFloor(units) {
      let rooms = []
      for (let i = 0; i < units; i++) {
        let key = this.tableBuildNumber + ( i + 1 )
        let roomArr = this.houseRoomMap.get(key)
        if(roomArr){
          roomArr.forEach(room => {
            rooms.push({
            'unit': i + 1,
            'room': room
            })
          })
        }

      }
      return rooms
    },

    getHouseNumber(floor, room, unit) {
      if (room < 10) {
        room = "0" + room;
      }
      if (unit != null && unit != '') {
        return unit + '单元-' + floor + room;
      }
      return floor + room;
    },

    getFieldTableData (tableBuildNumber, floor, unit, room) {
      if (room < 10) {
        room = "0" + room;
      }
      let key = tableBuildNumber + "_"
      + floor + "_"
      + unit + "_"
      + room
      let data = this.fieldDataMap.get(key)
      return data
    },

    getTableCellStyle (value) {
      let background = '#000000'
      let color = '#ffffff';
      if (value >= 23000) {
        background = '#4735AF'
      } else if (value >= 19000 && value < 23000) {
        background = '#4735AF'
      } else if (value >= 15000 && value < 19000) {
        background = '#5C4AC6'
      } else if (value >= 11000 && value < 15000) {
        background = '#6D5AD7'
      } else if (value >= 7000 && value < 11000) {
        background = '#8371EB'
      } else if (value >= 7000 && value < 7000) {
        background = '#9484F0'
      } else if (value >= 3000 && value < 7000) {
        background = '#A293F3'
        color = '#000000'
      } else if (value < 3000) {
        background = '#AD9FF5'
        color = '#000000'
      }
      return `background-color: ${background}; color: ${color};`
    },

    showFieldView( tableBuildNumber, floor, unit, room ){
      if (room < 10) {
        room = "0" + room;
      }
      let fieldViewKey = tableBuildNumber + "_" + floor + "_" + unit + "_" + room
      this.selectCellKey = fieldViewKey
      this.showCard = false
      fieldView.showFieldViewForHouse(fieldViewKey)
    },

    getSelectCellKey(tableBuildNumber, floor, unit, room){
      if (room < 10) {
        room = "0" + room;
      }
      return tableBuildNumber + "_" + floor + "_" + unit + "_" + room
    }
  }
}


</script>

<style scoped lang="scss">
.canvas-view {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
}
.mask {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  z-index: 88;
}
.bottom-card {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 800px;
  width: 90vw;
  height: calc(80vh - 24px);
  border-radius: 8px 8px 0 0;
  padding: 12px 10px 24px;

  display: flex;
  flex-flow: column nowrap;
  gap: 8px;
  background: rgba(255, 255, 255, 1);
  z-index: 888;
}

.building-box {
  width: 100%;
  min-height: fit-content;
  display: flex;
  flex-flow: row nowrap;

  .allBuilding-btn {
    width: auto;
    height: 24px;
    white-space: nowrap;
    font-size: 14px;
    border: none;
    background: transparent;
    position: relative;
  }

  .allBuilding-btn::after {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 88%;
    background: linear-gradient(to top, #f8fafd, #f3f5fb, #f8fafd);
    pointer-events: none;
    /* 使伪元素不干扰按钮的点击事件 */
  }
}


.buildNumber-terms {
  min-height: fit-content;
  white-space: nowrap;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 8px;

  .btn {
    min-width: 60px;
    width: 12vw;
    height: 24px;
    white-space: nowrap;
    font-size: 14px;
    border: none;

    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    box-sizing: border-box;
    background: transparent;
  }

  .active {
    position: relative;
  }

  .active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 50%;
    height: 8px;
    /* 边框厚度 */
    background: linear-gradient(to right, rgba(245, 170, 70, 0.8), rgba(245, 170, 70, 0));
    /* 渐变色 */
    border-radius: 8px;
    /* 圆角处理 */
    z-index: -1;
    /* 确保边框在内容下方 */
  }
}

  .table-container {
    width: 100%;
    min-height: 60px;
    max-height: 100%;
    overflow-y: auto;

    .floor-unit-table {
      width: 100%;
      background-color: #f8fafd;
      /* border-collapse: collapse; 去除表格的默认间距 */

      .header {
        position: sticky;
        /* 固定表头在容器顶部 */
        top: 0;
        background-color: #f3f5fb;
        font-size: 14px;
        z-index: 2;
      }

      .header th {
        padding: 8px;
      }

      .table-cell {
        min-width: 40px;
        padding: 6px;
        position: relative;
        font-size: 12px;
      }

      .table-cell-active {
        min-width: 40px;
        padding: 6px;
        position: relative;
        font-size: 12px;
        border: 2px solid red;
      }

      .field-data {
          font-weight: bold;
          font-size: 14px;
      }
    }
  }

.top {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  max-width: 800px;
  width: 90vw;
  height: 28px;

  display: flex;
  flex-flow: row nowrap;
  justify-content: space-around;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.88);
  text-shadow: 1px 1px 1px rgba(8, 8, 8, 0.8);
  z-index: 888;

  .value {
    color: rgb(245, 170, 70);
    text-shadow: 1px 1px 1px rgba(245, 100, 17, 0.8);
  }

  .top-btn {
    width: 20vw;
    border: none;
    outline: none;
    box-shadow: none;
    background: transparent;
    background-size: 28px;
    background-position: center;
    /* 将背景图居中 */
    background-repeat: no-repeat;
    /* 防止背景图重复 */
    opacity: 0.8;
    /* 设置按钮整体的透明度 */
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
    /* 添加阴影 */
    cursor: pointer;
  }

  .unfold-btn {
    background-image: url('/public/images/unfold.png');
    /* 文字上下浮动 */
    animation: float 1s infinite alternate;
  }

  @keyframes float {
    0% {
      transform: translateY(0);
    }

    100% {
      transform: translateY(-5px);
    }
  }

  .fold-btn {
    background-image: url('/public/images/fold.png');
  }
}

</style>
