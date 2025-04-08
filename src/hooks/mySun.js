/**
 * 功能:太阳光模拟
 * 原理:通过经纬度和位置,计算太阳运行的轨迹
 */
import { ref } from "vue";
import { solarTerm } from "@/help/constant";
import * as SunCalc from "@/help/suncalc.js";
import * as THREE from "three";

export const useSun = () => {
  // 当前的建筑位置的经纬度
  const latitude = ref(23.1291);
  const longitude = ref(113.2644);

  const getAllSunlightPos = (term) => {
    const allSunlightPos = [];

    const timeInfo = {
      startTime: "8:00",
      endTime: "16:00",
      curTime: "",
      curHour: 0,
      curMin: 0,
    };

    // 依据节气计算日期
    const curTerms = term ?? solarTerm.minorCold.value;
    const curYear = new Date().getFullYear();
    let curDate = new Date(
      31556925974.7 * (curYear - 1900) +
        curTerms * 60000 +
        Date.UTC(1900, 0, 6, 2, 5)
    );

    for (let progress = 0; progress < 480; progress++) {
      // 计算范围内时间变动
      const hours = 8 + Math.floor(progress / 60);
      const minutes = progress % 60;

      curDate = new Date(
        curDate.getFullYear(),
        curDate.getMonth(),
        curDate.getDate(),
        hours,
        minutes
      );
      timeInfo.curHour = +hours > 9 ? hours : "0" + hours;
      timeInfo.curMin = +minutes > 9 ? minutes : "0" + minutes;

      // 计算光源位置
      const sunPosition = SunCalc.getPosition(
        curDate,
        latitude.value,
        longitude.value
      );
      const sunDirection = new THREE.Vector3();

      // 笛卡尔坐标系转换
      sunDirection.setFromSphericalCoords(
        1,
        Math.PI / 2 - sunPosition.altitude,
        -sunPosition.azimuth
      );
      sunDirection.normalize();

      // //光源到原点的距离
      const sunlightPosition = sunDirection.clone().multiplyScalar(200);
      allSunlightPos.push(sunlightPosition);
    }

    return allSunlightPos;
  };

  return {
    getAllSunlightPos,
  };
};
