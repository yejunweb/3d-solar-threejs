<template>
  <div ref="container"></div>
</template>

<script setup>
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ref, onMounted } from "vue";

const container = ref(null);

onMounted(() => {
  // 场景
  const scene = new THREE.Scene();

  // 相机
  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 30;

  // 渲染器
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.value.appendChild(renderer.domElement);

  // 环境光
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  // 太阳光
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.left = -20;
  directionalLight.shadow.camera.right = 20;
  directionalLight.shadow.camera.top = 20;
  directionalLight.shadow.camera.bottom = -20;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  scene.add(directionalLight);

  // 控制
  const controls = new OrbitControls(camera, renderer.domElement);

  // 楼层高度
  const floorHeight = 3.3;
  // 楼层数量
  const floorCount = 5;
  // 楼栋前后间距
  const frontBackDistance = 10;
  // 楼栋左右间距
  const leftRightDistance = 7;

  // 创建楼栋
  function createBuilding(xOffset, zOffset) {
    const buildingGroup = new THREE.Group();
    for (let i = 0; i < floorCount; i++) {
      // 楼栋
      const buildingGeometry = new THREE.BoxGeometry(5, floorHeight, 3);
      const buildingMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
      const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
      buildingMesh.position.set(
        xOffset,
        i * floorHeight + floorHeight / 2,
        zOffset
      );
      buildingMesh.castShadow = true;
      buildingMesh.receiveShadow = true;
      buildingGroup.add(buildingMesh);

      // 落地窗
      const windowGeometry = new THREE.BoxGeometry(4, floorHeight - 0.2, 0.1);
      const windowMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });
      const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
      windowMesh.position.set(
        xOffset,
        i * floorHeight + floorHeight / 2,
        zOffset + 1.55
      );
      buildingGroup.add(windowMesh);

      // 分隔线
      if (i < floorCount - 1) {
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(
            xOffset - 2.5,
            (i + 1) * floorHeight,
            zOffset - 1.5
          ),
          new THREE.Vector3(
            xOffset + 2.5,
            (i + 1) * floorHeight,
            zOffset - 1.5
          ),
          new THREE.Vector3(
            xOffset + 2.5,
            (i + 1) * floorHeight,
            zOffset + 1.5
          ),
          new THREE.Vector3(
            xOffset - 2.5,
            (i + 1) * floorHeight,
            zOffset + 1.5
          ),
          new THREE.Vector3(
            xOffset - 2.5,
            (i + 1) * floorHeight,
            zOffset - 1.5
          ),
        ]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        const line = new THREE.LineLoop(lineGeometry, lineMaterial);
        buildingGroup.add(line);
      }
    }
    scene.add(buildingGroup);
    return buildingGroup;
  }

  // 创建四栋楼
  const buildings = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const xOffset = col * leftRightDistance + 2.5;
      const zOffset = row * frontBackDistance + 1.5;
      const building = createBuilding(xOffset, zOffset);
      buildings.push(building);
    }
  }

  // 地面
  const groundGeometry = new THREE.PlaneGeometry(50, 50);
  const groundMaterial = new THREE.MeshPhongMaterial({
    color: 0x808080,
    side: THREE.DoubleSide,
  });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = 0;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // 计算光照时长
  function calculateSunlightHours() {
    const startHour = 8;
    const endHour = 16;
    const totalCalculationMinutes = (endHour - startHour) * 60;
    const sunlightHours = Array.from(
      { length: buildings.length * floorCount },
      () => 0
    );
    const raycaster = new THREE.Raycaster();

    for (let timeStep = 0; timeStep < totalCalculationMinutes; timeStep++) {
      const totalDayMinutes = (18 - 6) * 60;
      const angle =
        (((startHour - 6) * 60 + timeStep) / totalDayMinutes) *
          ((Math.PI * 2) / 3) +
        Math.PI / 6 +
        Math.PI / 2;
      const sunX = 20 * Math.cos(angle - Math.PI / 2);
      const sunY = 10;
      const sunZ = 20 * Math.sin(angle - Math.PI / 2);
      directionalLight.position.set(sunX, sunY, sunZ);

      for (
        let currentBuildingIndex = 0;
        currentBuildingIndex < buildings.length;
        currentBuildingIndex++
      ) {
        const currentBuilding = buildings[currentBuildingIndex];
        for (let floor = 0; floor < floorCount; floor++) {
          const windowMesh = currentBuilding.children[floor * 3 + 1];
          const windowWorldPosition = new THREE.Vector3();
          windowMesh.getWorldPosition(windowWorldPosition);
          const sunWorldPosition = new THREE.Vector3();
          directionalLight.getWorldPosition(sunWorldPosition);
          const direction = sunWorldPosition
            .sub(windowWorldPosition)
            .normalize();
          raycaster.set(windowWorldPosition, direction);

          const allBuildingMeshes = buildings.flatMap((building) =>
            building.children.filter(
              (child) => child instanceof THREE.Mesh && child !== windowMesh
            )
          );
          const intersects = raycaster.intersectObjects(
            allBuildingMeshes,
            true
          );
          if (intersects.length === 0) {
            const index = currentBuildingIndex * floorCount + floor;
            sunlightHours[index]++;
          }
        }
      }
    }

    console.log("sunlightHours: ", sunlightHours);

    for (
      let currentBuildingIndex = 0;
      currentBuildingIndex < buildings.length;
      currentBuildingIndex++
    ) {
      const buildingRow = Math.floor(currentBuildingIndex / 2) + 1;
      const buildingCol = (currentBuildingIndex % 2) + 1;
      for (let floor = 0; floor < floorCount; floor++) {
        const index = currentBuildingIndex * floorCount + floor;
        const hours = (sunlightHours[index] / 60).toFixed(2);
        console.log(
          `Building (Row ${buildingRow}, Col ${buildingCol}), Floor ${
            floor + 1
          }: ${hours} hours of sunlight`
        );
      }
    }
  }
  calculateSunlightHours();

  // 计算四栋楼的地面中心点坐标
  function calculateBuildingCenters() {
    const centers = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const xOffset = col * leftRightDistance + 2.5;
        const zOffset = row * frontBackDistance + 1.5;
        const centerX = xOffset;
        const centerY = 0;
        const centerZ = zOffset;
        centers.push({ x: centerX, y: centerY, z: centerZ });
        console.log(
          `Building (Row ${row + 1}, Col ${
            col + 1
          }) center: (${centerX}, ${centerY}, ${centerZ})`
        );
      }
    }
    return centers;
  }
  const buildingCenters = calculateBuildingCenters();

  // 太阳运动时间
  let sunTime = (8 - 6) * 60;
  const totalDayMinutes = (18 - 6) * 60;

  // 渲染循环
  function animate() {
    requestAnimationFrame(animate);

    if (sunTime >= (8 - 6) * 60 && sunTime < (16 - 6) * 60) {
      const angle =
        (sunTime / totalDayMinutes) * ((Math.PI * 2) / 3) +
        Math.PI / 6 +
        Math.PI / 2;
      const sunX = 20 * Math.cos(angle - Math.PI / 2);
      const sunY = 10;
      const sunZ = 20 * Math.sin(angle - Math.PI / 2);
      directionalLight.position.set(sunX, sunY, sunZ);
    }

    sunTime = (sunTime + 1) % totalDayMinutes;

    renderer.render(scene, camera);
  }
  animate();
});
</script>

<style scoped>
div {
  width: 100%;
  height: 100vh;
}
</style>
