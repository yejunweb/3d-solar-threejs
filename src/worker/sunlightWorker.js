import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { useSun } from '@/hooks/mySun';

let modelScale = 1; // 模型缩放倍数，默认设为1
let modelUrl; // 模型路径

let renderer; // 渲染器
let scene; // 场景
let sunLight; // 太阳光
let isModelLoaded = false; // 添加模型加载状态标志

let houseLs = []; // 记录每户信息
let globalMesh; // 全局模型信息
let fieldMesh; // 视野检测用扇形

// 场景初始化
const initialize = ({ canvas }) => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#b2e0ff');
    scene.receiveShadow = true;

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true, // 抗锯齿
        logarithmicDepthBuffer: true,
        alpha: true,
    });

    // 告诉渲染器需要阴影效果
    renderer.shadowMap.enabled = true;
    // RGB模式编码（sRGBEncoding）进行对材质进行渲染
    renderer.outputEncoding = THREE.SRGBColorSpace;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    // 默认1为了让场景更明亮
    renderer.toneMappingExposure = 1;

    sunLight = new THREE.DirectionalLight(0xffffff);
    sunLight.visible = true;
    sunLight.intensity = 20; // 光线的密度，默认为1。 光照越强，物体表面就更明亮
    sunLight.shadow.camera.near = -1000; // 产生阴影的最近距离
    sunLight.shadow.camera.far = 1000; // 产生阴影的最远距离
    sunLight.shadow.camera.left = -1000; // 产生阴影距离位置的最左边位置
    sunLight.shadow.camera.right = 1000; // 最右边
    sunLight.shadow.camera.top = 1000; // 最上边
    sunLight.shadow.camera.bottom = -1000; //最下面
    sunLight.shadow.bias = -0.01; // 用于解决阴影水波纹条纹阴影的问题
    sunLight.shadow.mapSize.set(4096, 4096); //阴影清晰度

    // 告诉平行光需要开启阴影投射,物体遮挡阴影
    sunLight.castShadow = true;
    scene.add(sunLight);
};

/**
 * 模型加载
 */
const loadModel = url => {
    modelUrl = url;

    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();

        dracoLoader.setDecoderPath('/draco/');
        dracoLoader.setDecoderConfig({ type: 'js' });
        dracoLoader.preload();
        loader.setDRACOLoader(dracoLoader);

        loader.load(
            modelUrl,
            gltf => {
                const model = gltf.scene;
                model.traverse(child => {
                    if (child.name === 'Default_light' || child.name === 'Rectangle002') {
                        child.visible = false;
                    }
                    if (/^\d{1,2}[A-Z]\d{3}$/.test(child.name)) {
                        houseLs.push(child);
                    }
                    if (child.isMesh) {
                        const copyMaterial = child.material.clone();
                        copyMaterial.side = THREE.DoubleSide;
                        copyMaterial.originColor = copyMaterial.color.clone();
                        copyMaterial.color.setHex(0xfffff0);
                        child.material = copyMaterial;
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                model.scale.set(modelScale, modelScale, modelScale);
                scene.add(gltf.scene);

                // 保存全局模型信息（视野分析）
                globalMesh = model;

                // 等待一帧确保矩阵更新
                requestAnimationFrame(() => {
                    scene.updateMatrixWorld(true);
                    isModelLoaded = true;
                    resolve();
                });
            },
            undefined,
            error => {
                console.error('Error loading model:', error);
                reject(error);
            }
        );
    });
};

/**
 * 日照时间遍历
 */
const calcSunlight = callback => {
    let houseHourMap = {};

    if (!isModelLoaded) {
        console.warn('Model not loaded yet');
        return;
    }

    const { getAllSunlightPos } = useSun();
    const allSunlightPos = getAllSunlightPos();

    const raycaster = new THREE.Raycaster();

    // 确保场景矩阵已更新
    scene.updateMatrixWorld(true);

    for (let i = 0; i < allSunlightPos.length; i++) {
        const sunlightPosition = allSunlightPos[i];
        sunLight.position.copy(sunlightPosition);

        console.log('Sunlight calculate process: ', ((i / allSunlightPos.length) * 100).toFixed(2) + '%');

        for (let j = 0; j < houseLs.length; j++) {
            const houseMesh = houseLs[j];
            if (!houseMesh || !houseMesh.isMesh) {
                console.warn(`Invalid mesh at index ${j}`);
                continue;
            }

            const houseWorldPosition = new THREE.Vector3();
            houseMesh.getWorldPosition(houseWorldPosition);

            if (isNaN(houseWorldPosition.x) || isNaN(houseWorldPosition.y) || isNaN(houseWorldPosition.z)) {
                console.warn(`Invalid position for house ${houseMesh.name} at index ${j}`);
                continue;
            }

            const sunWorldPosition = new THREE.Vector3();
            sunLight.getWorldPosition(sunWorldPosition);
            const direction = sunWorldPosition.sub(houseWorldPosition).normalize();

            raycaster.set(houseWorldPosition, direction);
            const allMeshes = houseLs.filter(v => v instanceof THREE.Mesh && v !== houseMesh);
            const intersects = raycaster.intersectObjects(allMeshes, true);

            if (!houseHourMap?.[houseLs[j]?.['name']]) houseHourMap[houseLs[j]['name']] = 0;
            if (!intersects.length) houseHourMap[houseLs[j]['name']] += 1;
        }
    }

    if (callback) callback(houseHourMap);
};

/**
 * 视野检测
 */
const calcFieldView = callback => {
    let houseViewMap = {};

    // 创建扇形
    fieldMesh = createFanMesh();
    scene.add(fieldMesh);

    // 遍历每户
    for (let i = 0; i < houseLs.length; i++) {
        console.log('FieldView calculate process: ', ((i / houseLs.length) * 100).toFixed(2) + '%');

        const curHouseMesh = houseLs[i];
        const curMeshBox = new THREE.Box3().setFromObject(curHouseMesh);
        const { min, max } = curMeshBox;
        houseViewMap[curHouseMesh.name] = createfieldView(min.clone(), max.clone());
    }

    if (callback) callback(houseViewMap);
};

// 创建扇形网格
const createFanMesh = () => {
    const segments = 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((segments + 2) * 3); // 中心点 + 边缘点
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const indices = [];
    for (let i = 0; i < segments; i++) {
        indices.push(0, i + 1, i + 2);
    }
    geometry.setIndex(indices);

    const fanMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5,
    });

    return new THREE.Mesh(geometry, fanMaterial);
};

// 视野遍历计算
const createfieldView = (source, target) => {
    const midpoint = new THREE.Vector3().lerpVectors(source, target, 0.5); // 中点

    // 计算垂直方向（向量指向 target）
    const direction = new THREE.Vector3().subVectors(target, source).normalize();
    const verticalDir = new THREE.Vector3(-direction.z, 0, direction.x);

    const maxRadius = 120; // 最大可视距离
    const angleRange = (Math.PI / 3) * 2; // 视野角度 120°
    const segments = 120; // 分段数
    const raycaster = new THREE.Raycaster();

    // 设置观测出发点
    const originPos = midpoint.clone().add(new THREE.Vector3(0, 0, 0.1));

    const fieldGeometry = fieldMesh.geometry;
    const positions = fieldGeometry.attributes.position.array;

    // 设置中心点
    positions[0] = midpoint.x;
    positions[1] = midpoint.y;
    positions[2] = midpoint.z;

    for (let i = 0; i <= segments; i++) {
        // 角度偏移
        const angle = -angleRange / 2 + (i / segments) * angleRange;
        const dir = verticalDir
            .clone()
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle)
            .normalize();

        const box = new THREE.Box3().setFromObject(globalMesh);

        // 开始观测
        raycaster.set(originPos, dir);
        const intersects = raycaster.intersectObjects([globalMesh], true);

        // 距离测算
        let distance = maxRadius;
        if (intersects.length > 0 && intersects[0].distance < maxRadius) {
            distance = intersects[0].distance;
        }

        // 设置终点
        const idx = (i + 1) * 3;
        const endPoint = originPos.clone().add(dir.multiplyScalar(distance));
        positions[idx] = endPoint.x;
        positions[idx + 1] = originPos.y;
        positions[idx + 2] = endPoint.z;
    }
    fieldGeometry.attributes.position.needsUpdate = true;
    fieldGeometry.computeBoundingSphere();

    // 视野面积计算
    let meshArea = 0;
    const posArr = fieldGeometry.attributes.position.array;
    const posA = new THREE.Vector3(posArr[0], posArr[1], posArr[2]); // 取中心点
    for (let i = 3; i < posArr.length; i += 6) {
        if (!posArr[i + 5]) break;
        const posB = new THREE.Vector3(posArr[i], posArr[i + 1], posArr[i + 2]);
        const posC = new THREE.Vector3(posArr[i + 3], posArr[i + 4], posArr[i + 5]);
        const triangleArea = calculateTriangleArea(posA, posB, posC);
        meshArea += triangleArea;
    }

    return meshArea;
};

// 三角形面积计算
const calculateTriangleArea = (vertexA, vertexB, vertexC) => {
    const AB = new THREE.Vector3().subVectors(vertexB, vertexA);
    const AC = new THREE.Vector3().subVectors(vertexC, vertexA);
    // 计算叉积
    const cross = new THREE.Vector3().crossVectors(AB, AC);
    return cross.length() / 2;
};

/**
 * 线程信息传递
 */
self.onmessage = function (e) {
    const { type, data } = e.data;

    switch (type) {
        case 'init':
            initialize(data);
            self.postMessage({ type: 'ready' });
            break;

        case 'loadModel':
            loadModel(data)
                .then(() => {
                    self.postMessage({ type: 'modelLoaded' });
                })
                .catch(error => {
                    console.error('Error loading model:', error);
                    self.postMessage({ type: 'modelLoadError', data: error });
                });
            break;

        case 'calculate':
            calcSunlight(data => {
                self.postMessage({
                    type: 'sunlightCalcFinish',
                    data,
                });
            });
            calcFieldView(data => {
                self.postMessage({
                    type: 'fieldViewCalcFinish',
                    data,
                });
            });
            break;
    }
};
