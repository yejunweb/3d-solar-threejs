import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { useTag } from '@/hooks/useTag';
import { useSun } from '@/hooks/mySun';
import * as TWEEN from 'tween.js';
import * as Stats from 'stats.js';

export class basicThree {
    constructor() {
        this.container = document.querySelector('#sunshine');
        this.modelScale = 1; // 模型缩放倍数
        this.modelUrl; // 模型URL

        // three 3要素
        this.renderer; // 渲染器
        this.camera; // 相机
        this.scene; // 场景

        //光源
        this.ambientLight; // 环境光
        this.sunLight; // 太阳光

        //摄像头控制
        this.controls;
        this.renderEvents = [];

        // 记录原始的旋转中心点
        this.originalTarget;

        // 记录建筑物坐标信息
        this.buildLs = [];

        // 记录每户信息
        this.floorLs = [];
        this.floorMap = {};
        this.fieldMesh;
        this.globalMesh;

        this.init();
    }

    init() {
        this.initScene();
        this.initCamera();
        this.initRender();

        this.orbitHelper();
        this.statsHelper(); //性能辅助
        this.animate();

        window.onresize = this.onWindowResize.bind(this);
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#b2e0ff');
        // this.scene.add(new THREE.AmbientLight(0xffffff, 1))

        // 半球光,会比环境光颜色更自然
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); // (sky color, floor color)
        this.scene.add(hemisphereLight);

        this.scene.receiveShadow = true;
    }

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 3000);
        // 相机所在的位置，这是示例,最终的位置还得根据小区大小来选择,如果小区较大
        // 则相机需要更远, fov可能需要更大
        this.camera.position.set(0, 500, 500);
        this.camera.lookAt(new THREE.Vector3(0, 0, 0));
    }

    initRender() {
        const renderer = new THREE.WebGLRenderer({
            antialias: true, // 抗锯齿
            logarithmicDepthBuffer: true,
            alpha: true,
        });

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(1);
        //告诉渲染器需要阴影效果
        renderer.shadowMap.enabled = true;
        //RGB模式编码（sRGBEncoding）进行对材质进行渲染,SRGBColorSpace
        renderer.outputEncoding = THREE.SRGBColorSpace;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ReinhardToneMapping;
        // 默认1为了让场景更明亮
        renderer.toneMappingExposure = 1;

        this.container.appendChild(renderer.domElement);
        this.renderer = renderer;
    }

    initLight() {
        this.sunLight = new THREE.DirectionalLight(0xffffff);
        this.sunLight.visible = true;
        this.sunLight.intensity = 20; //光线的密度，默认为1。 光照越强，物体表面就更明亮
        this.sunLight.shadow.camera.near = -1000; //产生阴影的最近距离
        this.sunLight.shadow.camera.far = 1000; //产生阴影的最远距离
        this.sunLight.shadow.camera.left = -1000; //产生阴影距离位置的最左边位置
        this.sunLight.shadow.camera.right = 1000; //最右边
        this.sunLight.shadow.camera.top = 1000; //最上边
        this.sunLight.shadow.camera.bottom = -1000; //最下面
        this.sunLight.shadow.bias = -0.01; //用于解决阴影水波纹条纹阴影的问题
        this.sunLight.shadow.mapSize.set(4096, 4096); //阴影清晰度

        //告诉平行光需要开启阴影投射,物体遮挡阴影
        this.sunLight.castShadow = true;
        this.scene.add(this.sunLight);
    }

    /** 加载模型 */
    loadModel() {
        const loader = new GLTFLoader();
        /**
         * DRACOLoader 解码器介绍:
         * 在Three.js中，加载GLB模型时是否需要DRACOLoader解码器取决于您的模型文件是否使用了Draco压缩。
         * DRACOLoader是一个用于解码Draco压缩网格数据的加载器。
         * 如果您的GLB模型文件中的几何体数据已经通过 Draco 压缩过，那么在加载时就需要使用DRACOLoader进行解码。
         * 如果没有进行Draco压缩，那么直接使用GLTFLoader即可加载，无需额外设置DRACOLoader。
         */
        /**
         * 如果您使用gltf-pipeline工具对模型进行了Draco压缩，
         * 那么在加载这个压缩后的GLTF或GLB文件时，
         * 就需要用到DRACOLoader来解码Draco压缩过的几何数据。
         */

        const dracoLoader = new DRACOLoader();

        /**
         * 设置Draco解码库
         * Path: node_modules/three/examples/jsm/libs/draco文件复制到public文件下
         */
        dracoLoader.setDecoderPath('./draco/');
        dracoLoader.setDecoderConfig({ type: 'js' }); // 使用js方式解压
        dracoLoader.preload(); // 初始化_initDecoder 解码器
        loader.setDRACOLoader(dracoLoader); // 设置gltf加载器dracoLoader解码器

        loader.load(
            this.modelUrl,
            gltf => {
                const model = gltf.scene;

                // 遍历模型中的所有子对象，设置阴影接收和投射属性
                model.traverse(child => {
                    // 隐藏默认基座
                    if (child.name === 'Default_light' || child.name === 'Rectangle002') {
                        child.visible = false;
                    }

                    // 设置顶点标签标识（匹配建筑物分组）
                    if (/^\d{1,2}[A-Z]$/.test(child.name)) {
                        this.buildLs.push({
                            className: 'tag',
                            modelName: child?.uuid,
                            name: Number(child?.name?.match(/\d{1,2}/)?.[0] || 0) + '栋',
                            position: new THREE.Vector3().copy(child.position),
                        });
                    }

                    // 记录每户信息
                    if (/^\d{1,2}[A-Z]\d{3}$/.test(child.name)) {
                        this.floorLs.push(child);
                    }

                    if (child.isMesh) {
                        const copyMaterial = child.material.clone();
                        copyMaterial.side = THREE.DoubleSide;
                        copyMaterial.originColor = copyMaterial.color.clone();
                        copyMaterial.color.setHex(0xfffff0);
                        child.material = copyMaterial;

                        //物体遮挡阴影
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                model.scale.set(this.modelScale, this.modelScale, this.modelScale);
                this.scene.add(gltf.scene);
                this.set2DTag();

                this.globalMesh = model;

                // 光照计算
                // this.setSunlightHours();

                // 视野计算
                // const axesHelper = new THREE.AxesHelper(150);
                // this.scene.add(axesHelper);

                // 设定当前户
                // const curHouseMesh = this.floorLs.find(v => v.name === '8D701');
                // const curHousePos = new THREE.Vector3();
                // curHouseMesh.getWorldPosition(curHousePos);
                // // this.scene.add(this.createSphere(curHousePos));

                // // 获取当前户的两个端点
                // const curMeshBox = new THREE.Box3().setFromObject(curHouseMesh);
                // const boxHelper = new THREE.BoxHelper(curHouseMesh, 0xff0000);
                // this.scene.add(boxHelper);
                // const { min, max } = curMeshBox;
                // // this.scene.add(this.createSphere(min.clone(), '#5470c6')); // 左下角
                // // this.scene.add(this.createSphere(max.clone(), '#91cc75')); // 右下角

                // // 创建扇形
                // this.fieldMesh = this.createFanMesh();
                // this.scene.add(this.fieldMesh);

                // this.createfieldView(min.clone(), max.clone());
            },
            undefined,
            function (error) {
                console.error(error);
            }
        );
    }

    // 开始分析
    startAnalysis() {
        const canvas = document.createElement('canvas');
        canvas.className = 'worker-canvas';
        canvas.style.display = 'none';
        document.body.appendChild(canvas);

        const offscreen = canvas.transferControlToOffscreen();
        const sunlightWorker = new Worker(new URL('../worker/sunlightWorker.js', import.meta.url), {
            type: 'module',
        });

        sunlightWorker.postMessage(
            {
                type: 'init',
                data: {
                    canvas: offscreen,
                },
            },
            [offscreen]
        );

        sunlightWorker.onmessage = e => {
            const { type, data } = e.data;
            switch (type) {
                case 'ready':
                    console.log('Worker renderer is ready');
                    sunlightWorker.postMessage({ type: 'loadModel', data: '/zschjm.glb' });
                    break;
                case 'modelLoaded':
                    console.log('Worker model is loaded');
                    sunlightWorker.postMessage({ type: 'calculate' });
                    break;
                case 'sunlightCalcFinish':
                    console.log('Sunlight calculation result: ', data);
                    break;
                case 'fieldViewCalcFinish':
                    console.log('FieldView calculation result: ', data);
                    break;
                case 'processing':
                    console.log('Processing: ', data);
                    break;
                case 'finished':
                    console.log('Worker calculation completed');
                    sunlightWorker.terminate();
                    canvas.remove();
                    break;
            }
        };

        sunlightWorker.onerror = error => {
            console.error('Worker error:', error);
            sunlightWorker.terminate();
            canvas.remove();
        };
    }

    // 创建圆点
    createSphere(position, color = 0xffff00) {
        var geometry = new THREE.SphereGeometry(0.5, 32, 32);
        var material = new THREE.MeshBasicMaterial({
            color: color,
            depthTest: false,
        });
        var sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(position.x, position.y, position.z);
        return sphere;
    }

    // 创建标签
    createLabel(text, position, id) {
        const div = document.createElement('div');
        div.id = `${id}`;
        div.className = 'label';
        div.textContent = text;
        const i = document.createElement('i');
        i.dataset.id = id;
        i.className = 'el-icon-close';
        div.appendChild(i);
        const divLabel = new CSS2DObject(div);
        divLabel.position.copy(position);
        return divLabel;
    }

    // 创建扇形网格
    createFanMesh() {
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
    }

    createfieldView(source, target) {
        const midpoint = new THREE.Vector3().lerpVectors(source, target, 0.5); // 中点

        // 计算垂直方向（向量指向 target）
        const direction = new THREE.Vector3().subVectors(target, source).normalize();
        const verticalDir = new THREE.Vector3(-direction.z, 0, direction.x);

        // const arrowHelperDirection = new THREE.ArrowHelper(new THREE.Vector3().subVectors(target, source), midpoint, 50, 0xfac858); // 橙色
        // this.scene.add(arrowHelperDirection);

        // const arrowHelperVerticalDir = new THREE.ArrowHelper(verticalDir.clone(), midpoint, 50, 0xee6666); // 红色
        // this.scene.add(arrowHelperVerticalDir);

        const maxRadius = 120; // 最大可视距离
        const angleRange = (Math.PI / 3) * 2; // 视野角度 120°
        const segments = 120; // 分段数
        const raycaster = new THREE.Raycaster();

        // 设置观测出发点
        const originPos = midpoint.clone().add(new THREE.Vector3(0, 0, 0.1));
        // this.scene.add(this.createSphere(originPos, '#9a60b4'));

        const fieldGeometry = this.fieldMesh.geometry;
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

            const box = new THREE.Box3().setFromObject(this.globalMesh);
            console.log('Model bounding box:', box);

            // 开始观测
            raycaster.set(originPos, dir);
            const intersects = raycaster.intersectObjects([this.globalMesh], true);
            console.log('intersects: ', intersects);

            // 距离测算
            let distance = maxRadius;
            if (intersects.length > 0 && intersects[0].distance < maxRadius) {
                distance = intersects[0].distance;
            }

            const idx = (i + 1) * 3;
            const endPoint = originPos.clone().add(dir.multiplyScalar(distance));
            positions[idx] = endPoint.x;
            positions[idx + 1] = originPos.y;
            positions[idx + 2] = endPoint.z;
        }
        fieldGeometry.attributes.position.needsUpdate = true;
        fieldGeometry.computeBoundingSphere();

        const posArr = fieldGeometry.attributes.position.array;
        // console.log('posArr: ', posArr);
        // for (let i = 0; i < posArr.length; i += 3) {
        //     const pos = new THREE.Vector3(posArr[i], posArr[i + 1], posArr[i + 2]);
        //     this.scene.add(this.createSphere(pos, '#ffffff'));
        //     this.scene.add(this.createLabel(i === 0 ? i : i / 3, pos, i === 0 ? i : i / 3));
        // }

        // 视野面积计算
        let meshArea = 0;
        const posA = new THREE.Vector3(posArr[0], posArr[1], posArr[2]); // 取中心点
        for (let i = 3; i < posArr.length; i += 6) {
            if (!posArr[i + 5]) break;
            const posB = new THREE.Vector3(posArr[i], posArr[i + 1], posArr[i + 2]);
            const posC = new THREE.Vector3(posArr[i + 3], posArr[i + 4], posArr[i + 5]);
            const triangleArea = this.calculateTriangleArea(posA, posB, posC);
            meshArea += triangleArea;
        }
        console.log('meshArea: ', meshArea);
    }

    // 三角形面积计算
    calculateTriangleArea(vertexA, vertexB, vertexC) {
        const AB = new THREE.Vector3().subVectors(vertexB, vertexA);
        const AC = new THREE.Vector3().subVectors(vertexC, vertexA);
        // 计算叉积
        const cross = new THREE.Vector3().crossVectors(AB, AC);
        return cross.length() / 2;
    }

    /** 设置2D标签展示 */
    set2DTag() {
        const { createTag, renderTag } = useTag(this);
        createTag(this.buildLs);
        this.registRenderEvent(renderTag);
    }

    /** 日照时间遍历 */
    async setSunlightHours() {
        const { getAllSunlightPos } = useSun();
        const allSunlightPos = getAllSunlightPos();

        const raycaster = new THREE.Raycaster();

        for (let i = 0; i < allSunlightPos.length; i++) {
            const sunlightPosition = allSunlightPos[i];
            this.sunLight.position.copy(sunlightPosition);
            console.log('sunlightPosition: ', sunlightPosition);

            for (let j = 0; j < this.floorLs.length; j++) {
                const houseMesh = this.floorLs[j];
                const houseWorldPosition = new THREE.Vector3();
                houseMesh.getWorldPosition(houseWorldPosition);

                const sunWorldPosition = new THREE.Vector3();
                this.sunLight.getWorldPosition(sunWorldPosition);
                const direction = sunWorldPosition.sub(houseWorldPosition).normalize();

                raycaster.set(houseWorldPosition, direction);
                const allMeshes = this.floorLs.filter(v => v instanceof THREE.Mesh && v !== houseMesh);
                const intersects = raycaster.intersectObjects(allMeshes, true);

                if (!this.floorMap?.[this.floorLs[j]?.['name']]) this.floorMap[this.floorLs[j]['name']] = 0;
                if (!intersects.length) this.floorMap[this.floorLs[j]['name']] += 1;
            }
        }
        console.log('this.floorMap: ', this.floorMap);
    }

    initModel() {
        this.loadModel();
        this.initLight();
        this.basicfloor();
    }

    /**
     * 轨道控制器
     * 作用: 用户可以通过鼠标或触摸输入来交互式地旋转、缩放和平移3D视图
     */
    orbitHelper() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        // 使动画循环使用时阻尼或自转 意思是否有惯性
        this.controls.enableDamping = true;

        //是否可以缩放
        this.controls.enableZoom = true;
        //设置相机距离原点的最远距离
        this.controls.minDistance = 100;
        //设置相机距离原点的最远距离
        this.controls.maxDistance = 800;
        //设置相机上下旋转最大角度最大到平面
        this.controls.minPolarAngle = 0;
        this.controls.maxPolarAngle = Math.PI / 2 - 0.2;

        this.originalTarget = this.controls.target.clone();

        // 指南针
        this.controls.addEventListener('change', () => {
            const rotation = this.camera.rotation;
            let rotationDegrees = {
                x: THREE.MathUtils.radToDeg(rotation.x),
                y: THREE.MathUtils.radToDeg(rotation.y),
                z: THREE.MathUtils.radToDeg(rotation.z),
            };
            document.querySelector('.compass>div').style.transform = 'rotate(' + rotationDegrees.z + 'deg)';
        });
    }

    // 创建网格辅助
    gridHelper() {
        var gridHelper = new THREE.GridHelper(20, 20, 0x404040, 0x404040);
        this.scene.add(gridHelper);
    }

    //性能插件
    statsHelper() {
        this.stats = new Stats();
        this.stats.dom.style.top = '100px';
        document.body.appendChild(this.stats.dom);
    }

    //坐标轴辅助
    axesHelper() {
        var helper = new THREE.AxesHelper(10);
        this.scene.add(helper);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.render();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        if (this.stats) this.stats.update();
        this.renderer.render(this.scene, this.camera);
        this.controls.update();
        TWEEN.update();
        this.renderEvents.forEach(e => {
            if (e && typeof e === 'function') {
                e();
            }
        });
    }

    /** 注册渲染回调事件,以便外界想要在渲染的时候去执行一些事件 */
    registRenderEvent(event) {
        this.renderEvents.push(event);
    }

    animate() {
        this.render();
        requestAnimationFrame(this.animate.bind(this));
    }

    // 设置地面
    basicfloor() {
        const planeGeometry = new THREE.PlaneGeometry(2000, 2000);
        const texture = new THREE.TextureLoader().load('./bg.jpg');
        // var planeMaterial = new THREE.MeshLambertMaterial({
        //   color: 0x999999,
        //   side: THREE.DoubleSide,
        // });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;

        const planeMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            reflectivity: 0, // 反射率
            roughness: 1, // 粗糙度
            metalness: 0,
        });

        this.plane = new THREE.Mesh(planeGeometry, planeMaterial);
        this.plane.rotation.x = -0.5 * Math.PI;
        this.plane.position.z = -75;
        //物体遮挡阴影
        this.plane.castShadow = true;
        //告诉底部平面需要接收阴影
        this.plane.receiveShadow = true;
        this.scene.add(this.plane);
    }
}
