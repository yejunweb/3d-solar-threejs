<template>
  <div class="house-sunlight-hour" v-if="Object.keys(hourData).length">
    <van-tabs v-model="tabActive">
      <van-tab
        v-for="building in Object.keys(hourData)"
        :key="building"
        :title="building + '栋'"
      >
        <table cellpadding="0" cellspacing="0">
          <thead>
            <th
              v-for="house in Object.values(hourData?.[building])?.[0]?.length"
              :key="house"
              :width="
                100 / Object.values(hourData?.[building])?.[0]?.length + '%'
              "
            >
              户号{{ house }}
            </th>
          </thead>
          <tbody>
            <tr v-for="floor in Object.keys(hourData?.[building])" :key="floor">
              <td
                v-for="v in hourData?.[building]?.[floor]?.sort(
                  (a, b) => a.house - b.house
                )"
                :key="v.house"
              >
                <div>
                  {{ v?.house }}
                </div>
                <div>
                  <span>{{ v?.hours }}小时</span>
                  <span v-if="v?.minute">{{ v?.minute }}分钟</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </van-tab>
    </van-tabs>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  dataSet: {
    type: Object,
    default: () => ({}),
  },
});

/**
 * data
 */
const tabActive = ref("");
const hourData = ref({});

/**
 * methods
 */
const dataReslove = (data) => {
  return Object.entries(data).reduce((prev, cur) => {
    const [key, value] = cur;
    const buildNum = key.match(/^\d{1,2}/)?.[0]; // 楼号
    const houseNum = key.match(/(?<=[A-Z])\d+/)?.[0]; // 户号
    const floorNum = houseNum?.[0]; // 楼层
    if (!prev?.[buildNum]) prev[buildNum] = {};
    if (!prev?.[buildNum]?.[floorNum]) prev[buildNum][floorNum] = [];
    prev[buildNum][floorNum].push({
      build: buildNum,
      floor: floorNum,
      house: houseNum,
      originMinute: value, // 分钟原始值
      hours: minToHours(value)?.[0], // 光照小时
      minute: minToHours(value)?.[1], // 光照分钟
    });
    return prev;
  }, {});
};

const minToHours = (min) => [Math.floor(min / 60), min % 60];

const initialize = () => {
  hourData.value = dataReslove(props.dataSet);
  console.log("hourData.value: ", hourData.value);
  tabActive.value = Object.keys(hourData.value)?.[0];
};

/**
 * watch
 */
watch(
  () => props.dataSet,
  (val) => {
    console.log("val: ", val);
  }
);

/**
 * created
 */
initialize();
</script>

<style lang="less" scoped>
.house-sunlight-hour {
  height: 30vh;
  overflow: hidden;
  margin-top: 12px;
  border-top: 1px solid #f4f4f4;

  table {
    width: 100%;
    border: 1px solid #e6e6e6;

    th,
    td {
      box-sizing: border-box;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: normal;
      line-height: 1.4;
      text-align: center;
      text-overflow: ellipsis;
      word-break: break-all;
      white-space: normal;
      background: #fff;
      border-bottom: 1px solid #e6e6e6;

      &:nth-child(2n-1) {
        color: #878791;
        background: #f4f6ff;
        border-right: 1px solid #e6e6e6;
      }
    }

    > thead > th {
      line-height: 2;
    }

    > tbody > tr:last-child > td {
      border-bottom: none;
    }
  }

  :deep(.van-tabs) {
    .van-tabs__wrap {
      margin-bottom: 12px;

      .van-tabs__nav {
        padding-bottom: 12px;
      }
    }

    .van-tabs__content > .van-tab__panel {
      height: calc(30vh - var(--van-tabs-line-height) - 24px);
      overflow: auto;
    }
  }
}
</style>
