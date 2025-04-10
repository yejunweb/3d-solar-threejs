import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer"
import { Face } from 'three/addons/math/ConvexHull.js';
import { Earcut } from './earcut'

THREE.Face3 = Face
// THREE.Geometry = THREE.BufferGeometry

export default class fieldViewOpen {
  constructor(options) { 
    const { element, history, onChoseBuildNumber } = options
    this._element = element // canvas 元素
    this._history = history
    this.onChoseBuildNumber = onChoseBuildNumber
    this.buildingNumberMap = new Map()
    this.southWallMeshMap = new Map()
    this.buildingGroup = [];
    this.buildingPositionMap = new Map();
    this.southWallPointMap = new Map()
    this.fieldMap = new Map()
    this.fieldDataList = []
    this.mouseDownPosition = new THREE.Vector2(), // 记录鼠标按下位置
    this.mouseUpPosition = new THREE.Vector2() // 记录鼠标松开位置
  }

  init () {


    this._initRender()
    this._initScene()
    this._initCamera()
    this._initLight()
    this._initControl()
    this._addBasePlane()
    this._addSkyBox()

    this._render()
    this.lon = this._history.destLng
    this.lat = this._history.destLat

    this.fieldMesh = this.createFanMesh()
    this.createBuildings(this._history)
    this._scene.add(this.fieldMesh)
  }

  _render() {
    this._renderer.render(this._scene, this._camera)
    this._control.update()
    this._labelRenderer.render(this._scene, this._camera)
    //根据当前的位置计算与z轴负方向的夹角，即为正北方方向
    // var direction = new THREE.Vector3(-this._camera.position.x, 0, -this._camera.position.z).normalize()
    // 弧度值
    // var theta = Math.atan2(-direction.x, -direction.z)
    // this._onRotate && this._onRotate(theta)
    requestAnimationFrame(() => {
      this._render()
    })
  }

  _initRender() {
    let renderer = new THREE.WebGLRenderer({
      canvas: this._element,
      antialias: true, // 抗锯齿
      // logarithmicDepthBuffer: true, // 是否使用对数深度缓存
      alpha: true // 透明度
    })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0xb9d3ff, 1)

    this._renderer = renderer

    // CSS2DRenderer
    let labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(window.innerWidth, window.innerHeight)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    document.body.appendChild(labelRenderer.domElement)
    this._labelRenderer = labelRenderer

  }

  _initScene() {
    let scene = new THREE.Scene()
    scene.background = new THREE.Color(0x222222)
    this._scene = scene
  }

  _initCamera() {
    let camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      5,
      5000
    )
    camera.position.set(0, 400, 400)
    camera.lookAt(this._scene.position)
    this._camera = camera
  }

  _initLight() {
    // 环境光
    let ambientLight = new THREE.AmbientLight(0x666666, 0.8)
    this._scene.add(ambientLight)
    this._ambientLight = ambientLight

  }
  _initControl() {
    const control = new OrbitControls(this._camera, this._renderer.domElement)
    control.enableDamping = true
    control.enableZoom = true
    control.enablePan = true
    control.autoRotate = false
    control.autoRotateSpeed = 0.5
    control.minPolarAngle = 0
    control.maxPolarAngle = Math.PI / 2 - 0.1
    control.minDistance = 1
    control.maxDistance = 10000
    // control.minZoom = 0.1
    // control.maxZoom = 100
    this._control = control
  }

  // 天空盒
  _addSkyBox() {
    this._scene.background = new THREE.CubeTextureLoader()
      .setPath('/images/')
      .load([
        'center.png',
        'center.png',
        'top.png',
        'down.png',
        'center.png',
        'center.png'
      ])
  }

  // 地平面
  _addBasePlane() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.arc(0, 0, 1024, 0, Math.PI * 2, false); // 半径为1的圆
    const geometry = new THREE.ShapeGeometry(shape);
    // const planeGeometry = new THREE.PlaneGeometry(1024, 1024)
    // const groundTexture = new THREE.TextureLoader().load(this._baseMap)
    const planeMaterial = new THREE.MeshLambertMaterial({
      color: 0x9FB6E0,
      emissive: 0x9FB6E0, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
      emissiveIntensity: 0.3, // 可选：设置自发光的强度  ,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    const planeMesh = new THREE.Mesh(geometry, planeMaterial)
    planeMesh.name = '地图平面'
    planeMesh.rotateX(-Math.PI / 2)
    planeMesh.receiveShadow = true
    planeMesh.castShadow = true
    this._scene.add(planeMesh)
  }

  createBuildings(historyDetail) {
    // 初始化x和z的最小最大值
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    //设置中心点(观测楼第一个点)
    this.lon = historyDetail.destLng;
    this.lat = historyDetail.destLat;
    //添加楼
    if (historyDetail.barrierReqList && historyDetail.barrierReqList.length > 0) {
      for (var index = 0; index < historyDetail.barrierReqList.length; index++) {
        var building = historyDetail.barrierReqList[index];
        let houseRoomList = building.houseList;
        let buildGroup = new THREE.Group()
        if(houseRoomList.length > 0){
          for (var houseIndex = 0; houseIndex < houseRoomList.length; houseIndex++) {
            var houseRoom = houseRoomList[houseIndex];
            this.addBuildingByHouse(buildGroup, houseRoom, building);
          }
          buildGroup.name = `Building-${building.buildingNumber}-${building.totalFloor}`;
          this._scene.add(buildGroup);
  
          let buildPoints = this.transformCoordinate(this.transFormPositions(building.positionList));
          const sum = [0, 0, 0];
          buildPoints.forEach(point => {
            sum[0] += point[0];
            sum[2] += -point[1];
          })
  
          this.buildingPositionMap.set(buildGroup, new THREE.Vector3(sum[0] / buildPoints.length, (building.totalFloor + 2) * building.floorHeight, sum[2] / buildPoints.length))

          const div2 = document.createElement('div');
          div2.innerHTML = `<div class="three-d-label">${building.buildingNumber}#</div>`
          const label2 = new CSS2DObject(div2);
          label2.position.set(sum[0] / buildPoints.length, (building.totalFloor + 2) * building.floorHeight, sum[2] / buildPoints.length);
          buildGroup.add(label2);
          this.buildingNumberMap.set(building.buildingNumber, buildGroup)
        } else {
          this.addBuildingByBuilding(buildGroup, building);
          this._scene.add(buildGroup);
        }
        this.buildingGroup.push(buildGroup);
        const boundingBox = new THREE.Box3().setFromObject(buildGroup);
        if (boundingBox.min.x < minX) minX = boundingBox.min.x;
        if (boundingBox.max.x > maxX) maxX = boundingBox.max.x;

        // 更新z轴的最小最大值
        if (boundingBox.min.z < minZ) minZ = boundingBox.min.z;
        if (boundingBox.max.z > maxZ) maxZ = boundingBox.max.z;
      }
      if (this._history.roadList != null && this._history.roadList.length > 0) {
        this.createRoads(this._history.roadList)
      } else {
        this.createDefaultRoad(minX, maxX, minZ, maxZ)
      }
    }
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseClick = (event) => {
      if (this.inSingleMode) {
        return;
      }
      let x, y;
      if (event.touches) {
        // 触摸事件
        x = event.touches[0].clientX;
        y = event.touches[0].clientY;
      } else {
        // 鼠标事件
        x = event.clientX;
        y = event.clientY;
      }
      mouse.x = (x / window.innerWidth) * 2 - 1;
      mouse.y = -(y / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, this._camera);
      const intersects = raycaster.intersectObjects(this._scene.children, true);
      // console.log(intersects.length)
      if (intersects.length > 0) {
        const targetObject = intersects[0].object;
        // 查找该对象所属的 Group
        let selectedGroup = targetObject;
        while (selectedGroup && !(selectedGroup instanceof THREE.Group)) {
          selectedGroup = selectedGroup.parent;
        }
        // 如果找到 Group 并且是目标建筑物
        if (selectedGroup && selectedGroup.name.startsWith('Building')) {
          this.highlightBuilding(selectedGroup);
        }
      }
    };

    const onMouseDown = (event) => {
      this.mouseDownPosition.set(event.clientX, event.clientY);
    }

    const onMouseUp = (event) => {
      this.mouseUpPosition.set(event.clientX, event.clientY);
      const deltaX = this.mouseUpPosition.x - this.mouseDownPosition.x;
      const deltaY = this.mouseUpPosition.y - this.mouseDownPosition.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance < 5) {
        // 距离很小，认为是点击事件
        onMouseClick(event);
      } else {
        // 距离较大，认为是拖拽事件
        return
      }
    }

    // window.addEventListener('click', onMouseClick);
    window.addEventListener('pointerdown', onMouseDown);
    window.addEventListener('pointerup', onMouseUp);
  }

  createDefaultRoad(minX, maxX, minZ, maxZ) {
    // console.log(minX,maxX,minZ,maxZ)
    const group = new THREE.Group();
    const materialArr = new THREE.MeshLambertMaterial({
      color: 0xFFFFFF,
      side: THREE.BackSide,
      emissive: 0xFFFFFF, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
      emissiveIntensity: 0.5, // 可选：设置自发光的强度
      // depthTest:true,
      // polygonOffset: true,
      // polygonOffsetFactor: -1,
      // polygonOffsetUnits: 1,
    })
    var verticesA = [];
    var roadAPonit1 = new THREE.Vector3(minX - 30, 0.5, minZ - 60)
    var roadAPonit2 = new THREE.Vector3(minX - 10, 0.5, minZ - 60)
    var roadAPonit3 = new THREE.Vector3(minX - 10, 0.5, maxZ + 60)
    var roadAPonit4 = new THREE.Vector3(minX - 30, 0.5, maxZ + 60)
    verticesA.push(roadAPonit1);
    verticesA.push(roadAPonit2);
    verticesA.push(roadAPonit3);
    verticesA.push(roadAPonit4);
    var facesA = []
    facesA.push(new THREE.Face3(0, 1, 2));
    facesA.push(new THREE.Face3(0, 2, 3));
    var geometryA = new THREE.Geometry();
    geometryA.vertices = verticesA;
    geometryA.faces = facesA;
    geometryA.computeFaceNormals();
    const meshA = new THREE.Mesh(geometryA, materialArr)
    meshA.castShadow = true
    meshA.receiveShadow = true
    group.add(meshA);

    var verticesB = [];
    var roadBPonit1 = new THREE.Vector3(minX - 60, 0.5, minZ - 30)
    var roadBPonit2 = new THREE.Vector3(maxX + 60, 0.5, minZ - 30)
    var roadBPonit3 = new THREE.Vector3(maxX + 60, 0.5, minZ - 10)
    var roadBPonit4 = new THREE.Vector3(minX - 60, 0.5, minZ - 10)
    verticesB.push(roadBPonit1);
    verticesB.push(roadBPonit2);
    verticesB.push(roadBPonit3);
    verticesB.push(roadBPonit4);
    var facesB = []
    facesB.push(new THREE.Face3(0, 1, 2));
    facesB.push(new THREE.Face3(0, 2, 3));
    var geometryB = new THREE.Geometry();
    geometryB.vertices = verticesB;
    geometryB.faces = facesB;
    geometryB.computeFaceNormals();
    const roadMeshB = new THREE.Mesh(geometryB, materialArr)
    roadMeshB.castShadow = true
    roadMeshB.receiveShadow = true
    group.add(roadMeshB);

    var verticesC = [];
    var roadCPonit1 = new THREE.Vector3(maxX + 10, 0.5, minZ - 60)
    var roadCPonit2 = new THREE.Vector3(maxX + 30, 0.5, minZ - 60)
    var roadCPonit3 = new THREE.Vector3(maxX + 30, 0.5, maxZ + 60)
    var roadCPonit4 = new THREE.Vector3(maxX + 10, 0.5, maxZ + 60)
    verticesC.push(roadCPonit1);
    verticesC.push(roadCPonit2);
    verticesC.push(roadCPonit3);
    verticesC.push(roadCPonit4);
    var facesC = []
    facesC.push(new THREE.Face3(0, 1, 2));
    facesC.push(new THREE.Face3(0, 2, 3));
    var geometryC = new THREE.Geometry();
    geometryC.vertices = verticesC;
    geometryC.faces = facesC;
    geometryC.computeFaceNormals();
    const roadMeshC = new THREE.Mesh(geometryC, materialArr)
    roadMeshC.castShadow = true
    roadMeshC.receiveShadow = true
    group.add(roadMeshC);

    var verticesD = [];
    var roadDPonit1 = new THREE.Vector3(minX - 60, 0.5, maxZ + 10)
    var roadDPonit2 = new THREE.Vector3(maxX + 60, 0.5, maxZ + 10)
    var roadDPonit3 = new THREE.Vector3(maxX + 60, 0.5, maxZ + 30)
    var roadDPonit4 = new THREE.Vector3(minX - 60, 0.5, maxZ + 30)
    verticesD.push(roadDPonit1);
    verticesD.push(roadDPonit2);
    verticesD.push(roadDPonit3);
    verticesD.push(roadDPonit4);
    var facesD = []
    facesD.push(new THREE.Face3(0, 1, 2));
    facesD.push(new THREE.Face3(0, 2, 3));
    var geometryD = new THREE.Geometry();
    geometryD.vertices = verticesD;
    geometryD.faces = facesD;
    geometryD.computeFaceNormals();
    const roadMeshD = new THREE.Mesh(geometryD, materialArr)
    roadMeshD.castShadow = true
    roadMeshD.receiveShadow = true
    group.add(roadMeshD);


    //小区地面
    var verticesE = [];
    var communityPonit1 = new THREE.Vector3(minX - 10, 0.5, minZ - 10)
    var communityPonit2 = new THREE.Vector3(maxX + 10, 0.5, minZ - 10)
    var communityPonit3 = new THREE.Vector3(maxX + 10, 0.5, maxZ + 10)
    var communityPonit4 = new THREE.Vector3(minX - 10, 0.5, maxZ + 10)
    verticesE.push(communityPonit1)
    verticesE.push(communityPonit2)
    verticesE.push(communityPonit3)
    verticesE.push(communityPonit4)
    var facesE = []
    facesE.push(new THREE.Face3(0, 1, 2));
    facesE.push(new THREE.Face3(0, 2, 3));

    var geometryE = new THREE.Geometry();
    geometryE.vertices = verticesE;
    geometryE.faces = facesE;
    geometryE.computeFaceNormals();

    const materialArr2 = new THREE.MeshLambertMaterial({
      color: 0x8395B7,
      side: THREE.BackSide,
      emissive: 0x8395B7, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
      emissiveIntensity: 0.5, // 可选：设置自发光的强度  
      // depthTest:true,
      // polygonOffset: true,
      // polygonOffsetFactor: -1,
      // polygonOffsetUnits: 1,
    })

    const meshE = new THREE.Mesh(geometryE, materialArr2)
    meshE.castShadow = true
    meshE.receiveShadow = true
    group.add(meshE);

    this._scene.add(group)
  }

  createRoads(roadList) {
    let roadGroup = new THREE.Group()
    roadList.forEach(road => {
      let roadPoints = this.transformCoordinate(this.transFormPositions(road.geometryLoc))
      roadPoints = roadPoints.map(point => {
        return [point[0], 0.5, -point[1]]
      })
      let vertices = [];
      let faces = [];
      let data = [];
      for (let i = 0; i < roadPoints.length; i++) {
        vertices.push(
          new THREE.Vector3(roadPoints[i][0], roadPoints[i][1], roadPoints[i][2])
        )
        data.push(roadPoints[i][0], roadPoints[i][2])
      }
      var triangles = Earcut.triangulate(data);
      if (triangles && triangles.length != 0) {
        for (let i = 0; i < triangles.length; i++) {
          var tlength = triangles.length
          if (i % 3 == 0 && i < tlength - 2) {
            //底部的三角面
            let face1 = new THREE.Face3(
              triangles[i],
              triangles[i + 1],
              triangles[i + 2]
            )
            //纹理编号
            faces.push(face1)
          }
        }
      }
      var geometry = new THREE.Geometry()
      geometry.vertices = vertices
      geometry.faces = faces
      geometry.computeFaceNormals() //自动计算法向量
      let material = new THREE.MeshLambertMaterial({
        color: 0xFFFFFF,
        side: THREE.BackSide,
        emissive: 0xFFFFFF, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
        emissiveIntensity: 0.4, // 可选：设置自发光的强度
      })
      let mesh = new THREE.Mesh(geometry, material)
      roadGroup.add(mesh)
    })
    this._scene.add(roadGroup)
  }

  highlightBuilding(selectedBuilding) {
    var buildNameArr = selectedBuilding.name.split('-')
    if (buildNameArr.length > 0) {
      var buildNumber = buildNameArr[1]
      this.onChoseBuildNumber(buildNumber)
    }
    this.selectBuildGroup = selectedBuilding
    const buildingPosition = this.buildingPositionMap.get(selectedBuilding);
    const cameraPosition = new THREE.Vector3(buildingPosition.x, 0, buildingPosition.z + 100);
    // 切换相机视角到该建筑物
    this._camera.position.set(buildingPosition.x, 300, buildingPosition.z + 250 );
    this._camera.fov = 30; // 设置视角为 30 度（默认通常是 50 或 75）
    this._control.target.copy(cameraPosition);
  }

  transformCoordinate(coordinates) {
    const center = this.lonlat2WebMercator(this.lon, this.lat);

    // web 墨卡托投影有变形
    const p = Math.cos(this.degreesToRadians(this.lat));
    let newCoordinates = coordinates.map(coordinate => {
      let newRing = [];
      const newCoordinate = this.lonlat2WebMercator(coordinate[0], coordinate[1]);

      const x = Math.round((newCoordinate[0] - center[0]) * p * 100) / 100;
      const y = Math.round((newCoordinate[1] - center[1]) * p * 100) / 100;
      newRing.push(x);
      newRing.push(y);
      return newRing;
    })
    return newCoordinates;
  }

  transFormPositions(destPositions) {
    let coordinates = destPositions.map(destPosition => {
      let newRing = [];
      newRing.push(destPosition.lng);
      newRing.push(destPosition.lat);
      return newRing;
    })
    return coordinates;
  }

  addBuildingByHouse(buildGroup, houseRoom, building) {
    let totalFloor = building.totalFloor
    let floorHeight = building.floorHeight
    let points = this.transformCoordinate(this.transFormPositions(houseRoom.positionList));
    points = points.map(point => {
      return [point[0], 0, -point[1]]
    })
    let southWallPoints = this.southWallFormat(houseRoom.swallsEndpoints)
    for (let i = 0; i < totalFloor; i++) {
      this.createBuildingFloorByHouse(buildGroup, points, southWallPoints, floorHeight, i)
      this.createSouthWall(buildGroup, building.buildingNumber, floorHeight, houseRoom, points, i);
    }
  }

  addBuildingByBuilding(buildGroup, building) {
    let totalFloor = building.totalFloor
    let floorHeight = building.floorHeight
    let points = this.transformCoordinate(this.transFormPositions(building.positionList));
    points = points.map(point => {
      return [point[0], 0, -point[1]]
    })
    for (let i = 0; i < totalFloor; i++) {
      this.createBuildingFloorByBuilding(buildGroup, points, floorHeight, i)
    }
  }

  createBuildingFloorByHouse(buildGroup, points, southWallPointsIndex, floorHeight, index) {
    const geometry = this.getGeometryWithoutSouthWall(points, southWallPointsIndex, floorHeight * index, floorHeight)
    const materialArr =
      new THREE.MeshLambertMaterial({
        // color: 0xB60707,
        color: 0xA293F3,
        emissive: 0xA293F3, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
        emissiveIntensity: 0.6,
        side: THREE.BackSide,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
    const mesh = new THREE.Mesh(geometry, materialArr)
    mesh.castShadow = true
    mesh.receiveShadow = true
    buildGroup.add(mesh)
    // 创建边缘几何体
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 1);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x2C216D,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: 3,
    });

    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.renderOrder = 1;
    buildGroup.add(edgeLines)
  }

  createBuildingFloorByBuilding(buildGroup, points, floorHeight, index) {
    const geometry = this.getGeometry(points, floorHeight * index, floorHeight)
    const materialArr =
      new THREE.MeshLambertMaterial({
        // color: 0xB60707,
        color: 0xffffff,
        emissive: 0xffffff, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
        emissiveIntensity: 0.6,
        side: THREE.BackSide,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
    const mesh = new THREE.Mesh(geometry, materialArr)
    mesh.castShadow = true
    mesh.receiveShadow = true
    buildGroup.add(mesh)

    // 创建边缘几何体
    const edgeGeometry = new THREE.EdgesGeometry(geometry, 1);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x2C216D,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: 3,
    });

    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.renderOrder = 1;
    buildGroup.add(edgeLines)
  }

  createSouthWall(buildGroup, buildingNumber, floorHeight, houseRoom, points, index) {
    if(!houseRoom.swallsEndpoints){
      return
    }
    var southWallArr = JSON.parse(houseRoom.swallsEndpoints);
    for (var i = 0; i < southWallArr.length; i++) {
      var southWall = southWallArr[i]
      var southWallPointIndex = southWall.pid1
      let southWallPoints = []
      var southWallBasePoint1 = points[southWallPointIndex]
      var southWallBasePoint2 = points[southWallPointIndex + 1]
      southWallBasePoint1[1] = floorHeight * index
      southWallBasePoint2[1] = floorHeight * index
      southWallPoints.push(southWallBasePoint1)
      southWallPoints.push(southWallBasePoint2)
      southWallPoints.push([southWallBasePoint1[0], floorHeight * (index + 1), southWallBasePoint1[2]])
      southWallPoints.push([southWallBasePoint2[0], floorHeight * (index + 1), southWallBasePoint2[2]])
      const geometryOfSouth = this.getGeometryForSouthWall(southWallPoints)
      const basqPoint1Vector = new THREE.Vector3(southWallBasePoint1[0], southWallBasePoint1[1], southWallBasePoint1[2]);
      const basqPoint2Vector = new THREE.Vector3(southWallBasePoint2[0], southWallBasePoint2[1], southWallBasePoint2[2]);
      const distance = basqPoint1Vector.distanceTo(basqPoint2Vector);
      let materialSouth;
      if((index + 1)%3 == 0){
        materialSouth =
        new THREE.MeshLambertMaterial({
          map: new THREE.CanvasTexture(this.getTextCanvas1(distance,floorHeight,index + 1)),
          color: 0xA293F3,
          emissive: 0xA293F3, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
          emissiveIntensity: 0.6,
          side: THREE.BackSide,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
      } else {
        materialSouth =
        new THREE.MeshLambertMaterial({
          color: 0xA293F3,
          emissive: 0xA293F3, // 可选：设置自发光颜色，让材质在没有光照时也能有一定的亮度  
          emissiveIntensity: 0.6,
          side: THREE.BackSide,
          depthTest: true,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })
      }

      var meshSouth = new THREE.Mesh(geometryOfSouth, materialSouth)
      meshSouth.castShadow = true
      meshSouth.receiveShadow = true

      let houseName = buildingNumber + "_" + houseRoom.unit + "_" + Number(index + 1) + "_" + houseRoom.room
      if(this.southWallMeshMap.has(houseName)){
        let meshArr = this.southWallMeshMap.get(houseName)
        meshArr.push(meshSouth)
        this.southWallMeshMap.set(houseName, meshArr)
      } else {
        let meshArr = [] 
        meshArr.push(meshSouth)
        this.southWallMeshMap.set(houseName, meshArr)
      }


      buildGroup.add(meshSouth)

      // 创建边缘几何体
      const edgeGeometry = new THREE.EdgesGeometry(geometryOfSouth, 1);
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x2C216D,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: 3,
      });

      const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edgeLines.renderOrder = 1;
      buildGroup.add(edgeLines)

      if ( i == 0 ) {
        let pointA = new THREE.Vector3(southWallBasePoint1[0],southWallBasePoint1[1],southWallBasePoint1[2])
        let pointB = new THREE.Vector3(southWallBasePoint2[0],southWallBasePoint2[1],southWallBasePoint2[2])
        let fieldPoints = [pointA,pointB]
        let room = Number(houseRoom.room)
        if (room < 10) {
          room = "0" + room
        }
        let fieldDataName = buildingNumber + "_" + Number(index + 1) + "_" + houseRoom.unit + "_" + room
        this.southWallPointMap.set(fieldDataName,fieldPoints)
      }
    }
  }

  getGeometry(points, baseHeight, floorHeight){
    var topPoints = []
    let basePoints = JSON.parse(JSON.stringify(points))

    for (let i = 0; i < basePoints.length; i++) {
      basePoints[i][1] = baseHeight
      topPoints.push([basePoints[i][0], baseHeight + floorHeight, basePoints[i][2]])
    }
    var totalPoints = basePoints.concat(topPoints)
    var vertices = []
    for (let i = 0; i < totalPoints.length; i++) {
      vertices.push(
        new THREE.Vector3(totalPoints[i][0], totalPoints[i][1], totalPoints[i][2])
      )
    }
    var length = points.length
    var faces = []
    //侧面生成三角形
    for (let j = 0; j < length; j++) {
      if (j != length - 1) {
        faces.push(new THREE.Face3(j, j + 1, length + j + 1))
        faces.push(new THREE.Face3(length + j + 1, length + j, j))
      } else {
        faces.push(new THREE.Face3(j, 0, length))
        faces.push(new THREE.Face3(length, length + j, j))
      }
    }
    var data = []
    for (let i = 0; i < length; i++) {
      data.push(points[i][0], points[i][2])
    }
    var triangles = Earcut.triangulate(data);
    if (triangles && triangles.length != 0) {
      for (let i = 0; i < triangles.length; i++) {
        var tlength = triangles.length
        if (i % 3 == 0 && i < tlength - 2) {
          //底部的三角面
          let face1 = new THREE.Face3(
            triangles[i],
            triangles[i + 1],
            triangles[i + 2]
          )
          //顶部的三角面
          let face2 = new THREE.Face3(
            triangles[i] + length,
            triangles[i + 1] + length,
            triangles[i + 2] + length
          )
          //纹理编号
          face1.materialIndex = 1
          face2.materialIndex = 1
          faces.push(face1)
          faces.push(face2)
        }
      }
    }
    var geometry = new THREE.Geometry()
    geometry.vertices = vertices
    geometry.faces = faces
    geometry.computeFaceNormals() //自动计算法向量

    return geometry
  }

  getGeometryWithoutSouthWall(points, southWallPointIndex, baseHeight, floorHeight) {
    var topPoints = []
    let basePoints = JSON.parse(JSON.stringify(points))

    for (let i = 0; i < basePoints.length; i++) {
      basePoints[i][1] = baseHeight
      topPoints.push([basePoints[i][0], baseHeight + floorHeight, basePoints[i][2]])
    }
    var totalPoints = basePoints.concat(topPoints)
    var vertices = []
    for (let i = 0; i < totalPoints.length; i++) {
      vertices.push(
        new THREE.Vector3(totalPoints[i][0], totalPoints[i][1], totalPoints[i][2])
      )
    }
    var length = points.length
    var faces = []
    //侧面生成三角形
    for (let j = 0; j < length; j++) {
      if (southWallPointIndex.indexOf(j) != -1) {
        continue;
      }
      if (j != length - 1) {
        faces.push(new THREE.Face3(j, j + 1, length + j + 1))
        faces.push(new THREE.Face3(length + j + 1, length + j, j))
      } else {
        faces.push(new THREE.Face3(j, 0, length))
        faces.push(new THREE.Face3(length, length + j, j))
      }
    }
    var data = []
    for (let i = 0; i < length; i++) {
      data.push(points[i][0], points[i][2])
    }
    var triangles = Earcut.triangulate(data);
    if (triangles && triangles.length != 0) {
      for (let i = 0; i < triangles.length; i++) {
        var tlength = triangles.length
        if (i % 3 == 0 && i < tlength - 2) {
          //底部的三角面
          let face1 = new THREE.Face3(
            triangles[i],
            triangles[i + 1],
            triangles[i + 2]
          )
          //顶部的三角面
          let face2 = new THREE.Face3(
            triangles[i] + length,
            triangles[i + 1] + length,
            triangles[i + 2] + length
          )
          //纹理编号
          face1.materialIndex = 1
          face2.materialIndex = 1
          faces.push(face1)
          faces.push(face2)
        }
      }
    }
    var geometry = new THREE.Geometry()
    geometry.vertices = vertices
    geometry.faces = faces
    geometry.computeFaceNormals() //自动计算法向量

    return geometry
  }

  getGeometryForSouthWall(southWallPoints) {
    var vertices = []
    for (let i = 0; i < southWallPoints.length; i++) {
      vertices.push(
        new THREE.Vector3(southWallPoints[i][0], southWallPoints[i][1], southWallPoints[i][2])
      )
    }
    var faces = []
    faces.push(new THREE.Face3(0, 1, 3))
    faces.push(new THREE.Face3(3, 2, 0))
    
    var geometry = new THREE.Geometry()
    geometry.vertices = vertices
    geometry.faces = faces
    geometry.computeFaceNormals() //自动计算法向量
    geometry.faceVertexUvs = [
      [
        [
          new THREE.Vector2(1, 0),
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0, 1),
        ],
        [
          new THREE.Vector2(0, 1),
          new THREE.Vector2(1, 1),
          new THREE.Vector2(1, 0),
        ],
      ],
    ];
    return geometry
  }

  southWallFormat(swallsEndpoints) {
    if(!swallsEndpoints){
      return []
    }
    let southWallPoints = []
    var southWallArr = JSON.parse(swallsEndpoints);
    for (var index = 0; index < southWallArr.length; index++) {
      var southWall = southWallArr[index]
      southWallPoints.push(southWall.pid1)
    }
    return southWallPoints
  }

  lonlat2WebMercator(lon, lat) {
    let xy = []
    let x = (lon * 20037508.34) / 180
    let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)
    y = (y * 20037508.34) / 180
    xy[0] = x
    xy[1] = y
    return xy
  }

  degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  getTextCanvas1(width,height,floor){ 
    width *= 10
    height *= 10
    const baseFontSize = 24;
    const fontSize = Math.min(width/2, height/2 , baseFontSize * 2);
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.font = fontSize + 'px bold';
    ctx.fillStyle = 'black';
    const text = floor + '层';
    const textWidth = ctx.measureText(text).width;
    const textHeight = parseInt(ctx.font, 10);
    const x = canvas.width - textWidth; // 水平居右
    const y = canvas.height / 2 + textHeight / 4; 
    ctx.fillText(text, x, y);
 
    return canvas;
}

  showFieldViewForHouse(houseKey){
    let points = this.southWallPointMap.get(houseKey)
    if(points != null || points != undefined){
      this.createfieldView(points[1],points[0])
    }
  }

  createfieldView (pointA,pointB){
    const midpoint = new THREE.Vector3().lerpVectors(pointA, pointB, 0.5);
    // 计算垂直方向
    const direction = new THREE.Vector3()
    .subVectors(pointB, pointA)
    .normalize();
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);

    const finalCenter = midpoint.clone().add(perpendicular.clone().multiplyScalar(1));

    const maxRadius = 150;
    const angleRange = Math.PI / 3 * 2; // 视野角度
    const segments = 120;          // 分段数
    const raycaster = new THREE.Raycaster();

    const basePos = finalCenter.clone().add(new THREE.Vector3(0, 1.5, 0));

    const fieldGeometry = this.fieldMesh.geometry
    const positions = fieldGeometry.attributes.position.array;

    // 设置中心点
    positions[0] = finalCenter.x;
    positions[1] = finalCenter.y + 1.5;
    positions[2] = finalCenter.z;

    for (let i = 0; i <= segments; i++) {
      const angle = -angleRange/2 + (i/segments)*angleRange;
      const dir = perpendicular.clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
          .normalize();

      raycaster.set(basePos, dir);
      const intersects = raycaster.intersectObjects(this.buildingGroup,true);
      let distance = maxRadius;
      if (intersects.length > 0 && intersects[0].distance < maxRadius) {
          distance = intersects[0].distance;
      }

      const idx = (i + 1) * 3;
      const endPoint = basePos.clone().add(dir.multiplyScalar(distance));
      positions[idx] = endPoint.x;
      positions[idx + 1] = basePos.y;
      positions[idx + 2] = endPoint.z;
    }
    fieldGeometry.attributes.position.needsUpdate = true;
    fieldGeometry.computeBoundingSphere();
  }

  createFanMesh() {
    const segments = 120;  
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 2) * 3); // 中心点 + 边缘点
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const indices = [];
    for (let i = 0; i < segments; i++) {
        indices.push(0, i+1, i+2);
    }
    geometry.setIndex(indices);
    // 创建扇形网格
    const fanMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });
    
    return new THREE.Mesh(geometry, fanMaterial);
  }

  switchBuilding (number) {
    if (number !== undefined) {
      var selectBuild = this.buildingNumberMap.get(number)
      if(selectBuild){
        this.highlightBuilding(selectBuild)
      }
    }
  }

  initFieldSizeColor(fieldDataList){
    for (var i = 0; i < fieldDataList.length; i++) {
      let fieldData = fieldDataList[i];
      let meshKey = fieldData.buildingNumber + "_" + fieldData.unit + "_" + fieldData.floorNumber + "_" + fieldData.room
      let southMesh = this.southWallMeshMap.get(meshKey)
      southMesh.forEach(mesh => {
        this.updateSouthWallColor(mesh,fieldData.fieldSize)
      })
    }
  }

  updateSouthWallColor(mesh, fieldSize) {
    let color = 0xffffff;
    if (fieldSize >= 23000) {
      color = 0x4735AF
    } else if (fieldSize >= 19000 && fieldSize < 23000) {
      color = 0x4735AF
    } else if (fieldSize >= 15000 && fieldSize < 19000) {
      color = 0x5C4AC6
    } else if (fieldSize >= 11000 && fieldSize < 15000) {
      color = 0x6D5AD7
    } else if (fieldSize >= 7000 && fieldSize < 11000) {
      color = 0x8371EB
    } else if (fieldSize >= 3000 && fieldSize < 7000) {
      color = 0x9484F0
    } else if (fieldSize < 3000) {
      color = 0xA293F3
    }
    mesh.material.color.setHex(color)
    mesh.material.emissive.setHex(color)
  }

}