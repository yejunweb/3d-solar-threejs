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

// 记录建筑物坐标信息
let buildLs = [];

// 记录每户信息
let floorLs = [];

// 初始化
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

    // renderer.setSize(width, height);
    // renderer.setPixelRatio(1);
    // 告诉渲染器需要阴影效果
    renderer.shadowMap.enabled = true;
    // RGB模式编码（sRGBEncoding）进行对材质进行渲染
    renderer.outputEncoding = THREE.SRGBColorSpace;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    // 默认1为了让场景更明亮
    renderer.toneMappingExposure = 1;

    // container.appendChild(renderer.domElement);

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

                    if (/^\d{1,2}[A-Z]$/.test(child.name)) {
                        buildLs.push({
                            className: 'tag',
                            modelName: child?.uuid,
                            name: Number(child?.name?.match(/\d{1,2}/)?.[0] || 0) + '栋',
                            position: new THREE.Vector3().copy(child.position),
                        });
                    }

                    if (/^\d{1,2}[A-Z]\d{3}$/.test(child.name)) {
                        floorLs.push(child);
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

/** 日照时间遍历 */
const calculateSunlight = () => {
    let floorMap = {};

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

        for (let j = 0; j < floorLs.length; j++) {
            const houseMesh = floorLs[j];
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
            const allMeshes = floorLs.filter(v => v instanceof THREE.Mesh && v !== houseMesh);
            const intersects = raycaster.intersectObjects(allMeshes, true);
            console.log('process: ', `${i}-${j}`);

            if (!floorMap?.[floorLs[j]?.['name']]) floorMap[floorLs[j]['name']] = 0;
            if (!intersects.length) floorMap[floorLs[j]['name']] += 1;
        }
    }
    console.log('floorMap: ', floorMap);

    return floorMap;
};

// 接收主线程消息
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
            const result = calculateSunlight();
            self.postMessage({
                type: 'result',
                data: result,
            });
            break;
    }
};
