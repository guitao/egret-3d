﻿module egret3d {

    /**
    * @language zh_CN
    * @class egret3d.MapLoader
    * @classdesc
    * 加载egret地图类
    * 用于加载和解析egret地图文件的类，加载完毕后，mesh内容已经添加到了container中.
    * 主要封装了esm/eca/png/eam的加载和组装，以及mesh的render method相关信息，和灯光数据的生效.
    * 加载完毕后，会派发事件LoaderEvent3D.LOADER_COMPLETE
    * @see egret3d.EventDispatcher
    *
    * @includeExample loader/parser/map/MapLoader.ts
    * @version Egret 3.0
    * @platform Web,Native
    */

    export class MapLoader extends EventDispatcher {

        ///**
        //* @language zh_CN
        //* 属性动画对象，加载完成后 需要更新
        //* @version Egret 3.0
        //* @platform Web,Native
        //*/
        //public propertyAnims: Array<PropertyAnim> = new Array<PropertyAnim>();

        /**
        * @language zh_CN
        * 场景对象的所有根节点.
        * @version Egret 3.0
        * @platform Web,Native
        */
        public container: Object3D = null;

        /**
        * @language zh_CN
        * 是否自动播放动画  默认不自动播放
        * @version Egret 3.0
        * @platform Web,Native
        */
        public autoPlayAnimation: boolean = false;

        private _pathRoot: string = "";
        private _path: string = "";
        private _mapXmlParser: MapXmlParser = null;

        private _loaderDict: any = {};

        private _taskCount: number = 0;
        private _event: LoaderEvent3D = new LoaderEvent3D();
        public lightGroup: LightGroup = new LightGroup();

        public huds: Array<HUD> = new Array<HUD>();

        public textures: any = {};

        public view3d: View3D;
         /**
         * @language zh_CN
         * 构建一个场景加载对象 构建后直接加载
         * @param name 场景名字 默认为null 不加载 有值时 直接加载 
         * @param mapConfig 场景配置文件 默认为"MapConfig.xml"
         * @param path 场景文件路径 默认"resource/scene/"
         * @version Egret 3.0
         * @platform Web,Native
         */
        constructor(name: string = null, mapConfig: string = "MapConfig.xml", path: string = "resource/scene/") {
            super();
            this.container = new Object3D();
            if (name) {
                this.load(name, mapConfig, path);
            }
           
        }

         /**
         * @language zh_CN
         * 加载场景
         * @param name 场景名字
         * @param mapConfig 场景配置文件 默认为"MapConfig.xml"
         * @param path 场景文件路径 默认"resource/scene/"
         * @version Egret 3.0
         * @platform Web,Native
         */
        public load(name: string, mapConfig: string = "MapConfig.xml", path: string = "resource/scene/") {
            this._pathRoot = path + name + "/";
            this._path = this._pathRoot + mapConfig;


            var load: URLLoader = this.findLoader(this._path);
            if (!load) {
                load = this.createLoader(this._path);
                load.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onXmlLoad, this);
            }
            else {
                if (load.data) {
                    this.parseXML(load.data);
                }
            }
        }


        private addLoader(loader: URLLoader) {
            this._loaderDict[loader.url] = loader;
        }

        private findLoader(path: string): URLLoader {
            return this._loaderDict[path];
        }

        private parseXML(xml: string) {
            var xmlDoc = XMLParser.parse(xml);
            this._mapXmlParser = new MapXmlParser(xmlDoc);

            this.createLight();

            for (var i: number = 0; i < this._mapXmlParser.nodeList.length; i++) {
                var mapNodeData: MapNodeData = this._mapXmlParser.nodeList[i];
                if (!mapNodeData.object3d.parent) {
                    this.container.addChild(mapNodeData.object3d);
                }

                if (mapNodeData.type == "Object3D" || mapNodeData.type == "Camera3D") {
                    this.doLoadEpa(mapNodeData);
                }

                switch (mapNodeData.type) {
                    case "Mesh":
                        if (mapNodeData.path) {
                            var path: string = this._pathRoot + mapNodeData.path;
                            var esmload: URLLoader = this.findLoader(path);
                            if (!esmload) {
                                esmload = this.createLoader(path);

                                var nodeDatas: Array<MapNodeData> = [];
                                nodeDatas.push(mapNodeData);
                                esmload["esmnodeData"] = nodeDatas;
                                esmload.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onEsmLoad, this);
                            }
                            else {
                                var nodeDatas: Array<MapNodeData> = esmload["esmnodeData"];
                                nodeDatas.push(mapNodeData);

                                if (esmload.data) {
                                    this.processMesh(mapNodeData, new Mesh(esmload.data, new TextureMaterial()));
                                }
                            }
                        }
                        break;
                    case "Terrain":
                        if (mapNodeData.texture) {
                            var path: string = this._pathRoot + mapNodeData.texture;
                            var heightImgload: URLLoader = this.findLoader(path);
                            if (!heightImgload) {
                                heightImgload = this.createLoader(path);

                                var nodeDatas: Array<MapNodeData> = [];
                                nodeDatas.push(mapNodeData);
                                heightImgload["heightNodeDatas"] = nodeDatas;
                                heightImgload.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onHeightTextureLoad, this);
                            }
                            else {
                                var nodeDatas: Array<MapNodeData> = heightImgload["heightNodeDatas"];
                                nodeDatas.push(mapNodeData);

                                if (heightImgload.data) {
                                    var envHeightGeometry: ElevationGeometry = new ElevationGeometry(heightImgload.data, mapNodeData.width, mapNodeData.height, mapNodeData.depth, mapNodeData.segmentsW, mapNodeData.segmentsH);
                                    var mesh: Mesh = new Mesh(envHeightGeometry, new TextureMaterial(heightImgload.data));
                                    this.processHeightMesh(mapNodeData, mesh);
                                }
                            }
                        }
                        break;
                }
            }

            for (var i: number = 0; i < this._mapXmlParser.textures.length; ++i) {
                var data: any = this._mapXmlParser.textures[i];
                var path: string = this._pathRoot + data.path;
                var textureLoad: URLLoader = this.findLoader(path);
                if (!textureLoad) {
                    textureLoad = this.createLoader(path);
                    textureLoad["name"] = data.name;
                    textureLoad.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onTexture, this);
                }
                else {

                }

            }

            for (var i: number = 0; i < this._mapXmlParser.hudList.length; ++i) {
                var hudData: HUDData = this._mapXmlParser.hudList[i];
                var hud: HUD = new HUD();

                hud.name = hudData.name;
                hud.bothside = hudData.bothside;
                hud.x = hudData.x;
                hud.y = hudData.y;
                hud.rotationX = hudData.rx;
                hud.rotationY = hudData.ry;
                hud.rotationZ = hudData.rz;
                hud.width = hudData.width;
                hud.height = hudData.height;

                this.huds.push(hud);
                hudData.hud = hud;

                if (!hudData.texture) {
                    continue;
                }
                var path: string = this._pathRoot + hudData.texture;
                var hudLoad: URLLoader = this.findLoader(path);
                if (!hudLoad) {
                    hudLoad = this.createLoader(path);

                    var hudDatas: Array<HUDData> = [];
                    hudDatas.push(hudData);
                    hudLoad["hudDatas"] = hudDatas;
                    hudLoad.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onHudLoad, this);
                }
                else {
                    var hudDatas: Array<HUDData> = hudLoad["hudDatas"];
                    hudDatas.push(hudData);

                    if (hudLoad.data) {
                        hud.diffuseTexture = hudLoad.data;
                    }
                }
            }
        }

        private onXmlLoad(e: LoaderEvent3D) {
            this.parseXML(e.loader.data);
            this.processTask(e.loader);
        }

        private onTexture(e: LoaderEvent3D) {
            var textureLoad: URLLoader = e.loader;
            this.textures[textureLoad["name"]] = textureLoad.data;
            this.processTask(textureLoad);
        }

        private onHudLoad(e: LoaderEvent3D) {
            var hudDatas: Array<HUDData> = e.loader["hudDatas"];
            for (var i: number = 0; i < hudDatas.length; ++i) {
                var hudData: HUDData = hudDatas[i];
                hudData.hud.diffuseTexture = e.loader.data;
            }
            this.processTask(e.loader);
        }

        private doLoadEpa(mapNodeData: MapNodeData) {

            if (mapNodeData.propertyAnims) {
                for (var j: number = 0; j < mapNodeData.propertyAnims.length; ++j) {
                    var propertyAnimsData: any = mapNodeData.propertyAnims[j];

                    var path: string = this._pathRoot + propertyAnimsData["path"];
                    var epaload: URLLoader = this.findLoader(path);
                    if (!epaload) {
                        epaload = this.createLoader(path);

                        var nodeDatas: Array<MapNodeData> = [];
                        nodeDatas.push(mapNodeData);
                        epaload["epanodeData"] = nodeDatas;
                        epaload.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onEpaLoad, this);
                    }
                    else {
                        var nodeDatas: Array<MapNodeData> = epaload["epanodeData"];
                        nodeDatas.push(mapNodeData);

                        if (epaload.data) {
                            this.processEpa(mapNodeData, epaload.data);
                        }
                    }
                }
            }
        }

        private processEpa(mapNodeData: MapNodeData, pro: PropertyAnim) {
            mapNodeData.object3d.bindAnimation(pro);
            if (this.autoPlayAnimation) {
                if (mapNodeData.object3d.proAnimation) {
                    mapNodeData.object3d.proAnimation.play();
                }
            }
        }

        private onHeightTextureLoad(e: LoaderEvent3D) {
            var heightImgload: URLLoader = e.loader;
            var nodeDatas: Array<MapNodeData> = heightImgload["heightNodeDatas"];

            for (var i: number = 0; i < nodeDatas.length; ++i) {
                var mapNodeData: MapNodeData = nodeDatas[i];
                var envHeightGeometry: ElevationGeometry = new ElevationGeometry(heightImgload.data, mapNodeData.width, mapNodeData.height, mapNodeData.depth, mapNodeData.segmentsW, mapNodeData.segmentsH);
                var mesh: Mesh = new Mesh(envHeightGeometry, new TextureMaterial(heightImgload.data));
                this.processHeightMesh(mapNodeData, mesh);
                this.doLoadEpa(mapNodeData);
            }

            this.processTask(heightImgload);
        }

        private processHeightMesh(mapNodeData: MapNodeData, mesh: Mesh) {
            mesh.name = mapNodeData.object3d.name;
            mesh.position = mapNodeData.object3d.position;
            mesh.orientation = mapNodeData.object3d.orientation;
            mesh.scale = mapNodeData.object3d.scale;
            mapNodeData.object3d.swapObject(mesh);
            mapNodeData.object3d = mesh;
            this.processMat(mapNodeData);
        }

        private processMesh(mapNodeData: MapNodeData, mesh: Mesh) {
            mesh.name = mapNodeData.object3d.name;
            mesh.position = mapNodeData.object3d.position;
            mesh.orientation = mapNodeData.object3d.orientation;
            mesh.scale = mapNodeData.object3d.scale;
            mapNodeData.object3d.swapObject(mesh);
            mapNodeData.object3d = mesh;
            this.processMat(mapNodeData);

            for (var j: number = 0; j < mapNodeData.skinClips.length; j++) {

                var eamData: any = mapNodeData.skinClips[j];


                var path: string = this._pathRoot + eamData["path"];
                var load: URLLoader = this.findLoader(path);

                if (!load) {
                    this.createLoader(path);
                    load["name"] = eamData["name"];

                    var eamnodeDatas: Array<MapNodeData> = [];
                    eamnodeDatas.push(mapNodeData);
                    load["eamnodeData"] = eamnodeDatas;

                    load["mesh"] = mesh;
                    load.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onEamLoad, this);
                }
                else {
                    var eamnodeDatas: Array<MapNodeData> = load["eamnodeData"];
                    eamnodeDatas.push(mapNodeData);

                    if (load.data) {
                        var clip: SkeletonAnimationClip = load.data;
                        mesh.animation.skeletonAnimationController.addSkeletonAnimationClip(clip.clone());
                    }
                }
            }
        }

        private onEsmLoad(e: LoaderEvent3D) {
            var nodeDatas: Array<MapNodeData> = e.loader["esmnodeData"];
            var mesh: Mesh = new Mesh(e.loader.data, new TextureMaterial());

            var cloneMesh: Mesh = mesh;
            for (var i: number = 0; i < nodeDatas.length; ++i) {
                var mapNodeData: MapNodeData = nodeDatas[i];
                if (cloneMesh) {
                    this.processMesh(mapNodeData, cloneMesh);
                    this.doLoadEpa(mapNodeData);

                    if (i == nodeDatas.length - 1) {
                        break;
                    }
                    cloneMesh = mesh.clone();
                }
            }

            this.processTask(e.loader);
        }

        private onEamLoad(e: LoaderEvent3D) {

            var nodeDatas: Array<MapNodeData> = e.loader["eamnodeData"];
            var clip: SkeletonAnimationClip = e.loader.data;
            clip.animationName = e.loader["name"];

            var cloneClip: SkeletonAnimationClip = clip;

            for (var i: number = 0; i < nodeDatas.length; ++i) {
                var mapNodeData: MapNodeData = nodeDatas[i];
                var mesh: Mesh = <Mesh>mapNodeData.object3d;
                if (cloneClip) {
                    mesh.animation.skeletonAnimationController.addSkeletonAnimationClip(cloneClip);
                    if (i == nodeDatas.length - 1) {
                        break;
                    }
                    cloneClip = clip.clone();
                }
            }
            if (this.autoPlayAnimation) {
                mesh.animation.play(clip.animationName);
            }
            this.processTask(e.loader);
        }

        private onEpaLoad(e: LoaderEvent3D) {

            var nodeDatas: Array<MapNodeData> = e.loader["epanodeData"];
            var pa: PropertyAnim = e.loader.data;
            var clonePa: PropertyAnim = pa;

            for (var i: number = 0; i < nodeDatas.length; ++i) {
                var mapNodeData: MapNodeData = nodeDatas[i];
                if (clonePa) {
                    this.processEpa(mapNodeData, clonePa);

                    if (i == nodeDatas.length - 1) {
                        break;
                    }
                    clonePa = pa.clone();
                }
            }
            
            this.processTask(e.loader);
        }

        private onImgLoad(e: LoaderEvent3D) {
            var load: URLLoader = e.loader;

            var textureDatas: any = load["textureDatas"];
            var textureData: any = {};
            var mesh: Mesh = null;
            var mat: MaterialBase = null;
            for (var i: number = 0; i < textureDatas.length; ++i) {

                textureData = textureDatas[i];
                var mapNodeData: MapNodeData = textureData.mapNodeData;
                mesh = <Mesh>mapNodeData.object3d;
                mat = mesh.getMaterial(textureData.matID);

                mat[textureData.type] = load.data;
            }

            this.processTask(load);
        }

        private onImgMethodLoad(e: LoaderEvent3D) {
            var load: URLLoader = e.loader;

            var methodDatas: any = load["methodDatas"];
            var methodData: any = {};

            for (var i: number = 0; i < methodDatas.length; ++i) {
                methodData = methodDatas[i];

                methodData.method[methodData.textureName] = load.data;
            }

            this.processTask(load);
        }

        private createLoader(path: string): URLLoader {
            var load: URLLoader = new URLLoader(path);
            this.addLoader(load);
            this._taskCount++;
            console.log("+++" + load.url + "+++" + this._taskCount);
            return load;
        }

        private processTask(load:URLLoader) {
            this._taskCount--;
            console.log("---" + load.url + "---" + this._taskCount);
            if (this._taskCount <= 0) {
                this._event.eventType = LoaderEvent3D.LOADER_COMPLETE;
                this._event.target = this;

                if (this.view3d) {
                    for (var i: number = 0; i < this.huds.length; ++i) {
                        this.view3d.addHUD(this.huds[i]);
                    }
                }

                this.dispatchEvent(this._event);
            }
        }

        private addImaTask(name:string, type:string, matID:number, mapNodeData:MapNodeData):URLLoader {
            var load: URLLoader = null;

            var path: string = this._pathRoot + name;
            var load: URLLoader = this.findLoader(path);

            if (!load) {
                load = this.createLoader(path);

                var textureDatas: any = [];
                var textureData: any = {};

                textureData.type = type;
                textureData.matID = matID;
                textureData.mapNodeData = mapNodeData;
                textureDatas.push(textureData);
                load["textureDatas"] = textureDatas;

                load.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onImgLoad, this);
            }
            else {

                var textureDatas: any = load["textureDatas"];

                var textureData: any = {};
                textureData.type = type;
                textureData.matID = matID;
                textureData.mapNodeData = mapNodeData;

                textureDatas.push(textureData);
            }

            return load;
        }


        private addMethodImgTask(name:string, method:MethodBase, textureName:string): URLLoader {
            var path: string = this._pathRoot + name;
            var load: URLLoader = this.findLoader(path);

            if (!load) {
                load = this.createLoader(path);

                var methodDatas: any = [];
                var methodData: any = {};
                methodData.method = method;
                methodData.textureName = textureName;
                methodDatas.push(methodData);

                load["methodDatas"] = methodDatas;
                load.addEventListener(LoaderEvent3D.LOADER_COMPLETE, this.onImgMethodLoad, this);
            }
            else {
                var methodDatas: any = load["methodDatas"];
                var methodData: any = {};
                methodData.method = method;
                methodData.textureName = textureName;
                methodDatas.push(methodData);

                if (load.data) {
                    methodData.method[methodData.textureName] = load.data;
                }
            }

            return load;
        }


        private processMat(mapNodeData: MapNodeData) {
            var mesh: Mesh = <Mesh>mapNodeData.object3d;
            for (var i: number = 0; i < mapNodeData.materialIDs.length; ++i) {
                var matData: MatSphereData = this._mapXmlParser.matDict[mapNodeData.materialIDs[i]];
                if (!matData) {
                    continue;
                }

                var material: TextureMaterial = <TextureMaterial>mesh.getMaterial(i);
                if (!material) {
                    material = new TextureMaterial();
                    mesh.addSubMaterial(i, material);
                }

                var load: URLLoader = null;

                if (matData.diffuseTextureName != "") {
                    load = this.addImaTask(matData.diffuseTextureName, "diffuseTexture", i, mapNodeData);
                    if (load.data) {
                        material.diffuseTexture = load.data;
                    }
                }

                if (matData.normalTextureName != "") {
                    load = this.addImaTask(matData.normalTextureName, "normalTexture", i, mapNodeData);
                    if (load.data) {
                        material.normalTexture = load.data;
                    }
                }

                if (matData.specularTextureName != "") {
                    load = this.addImaTask(matData.specularTextureName, "specularTexture", i, mapNodeData);
                    if (load.data) {
                        material.specularTexture = load.data;
                    }
                }

                material.diffuseColor = matData.diffuseColor;
                material.ambientColor = matData.ambientColor;
                material.specularColor = matData.specularColor;
                material.alpha = matData.alpha;
                material.specularLevel = matData.specularLevel;
                material.gloss = matData.gloss;


                material.castShadow = matData.castShadow;
                material.acceptShadow = matData.acceptShadow;
                material.smooth = matData.smooth;
                material.repeat = matData.repeat;
                material.bothside = matData.bothside;

                material.drawMode = matData.drawMode;
                material.cullMode = matData.cullMode;
                material.blendMode = matData.blendMode;

                material.cutAlpha = matData.cutAlpha;

                material.uvRectangle.copy(matData.uvRectangle);
                var method: MatMethodData = null;

                for (method of matData.methods) {
                    if (method.type == MatMethodData.lightmapMethod) {
                        var lightmapMethod: LightmapMethod = new LightmapMethod(method.usePower);
                        var lightTexture: ITexture = CheckerboardTexture.texture;

                        var textureData: any = method.texturesData[0];

                        load = this.addMethodImgTask(textureData.path, lightmapMethod, textureData.attributeName);
                        if (load.data) {
                            lightTexture = load.data;
                        }

                        material.diffusePass.addMethod(lightmapMethod);
                        lightmapMethod.lightTexture = lightTexture;
                    }
                    else if (method.type == MatMethodData.uvRollMethod) {
                        var uvScrollMethod: UVRollMethod = new UVRollMethod();
                        uvScrollMethod.speedU = method.uSpeed;
                        uvScrollMethod.speedV = method.vSpeed;
                        material.repeat = true;

                        uvScrollMethod.start(true);
                        material.diffusePass.addMethod(uvScrollMethod);
                    }
                    else if (method.type == MatMethodData.alphaMaskMethod) {
                        var maskmapMethod: AlphaMaskMethod = new AlphaMaskMethod();
                        var maskTexture: ITexture = CheckerboardTexture.texture;
                        var textureData: any = method.texturesData[0];

                        load = this.addMethodImgTask(textureData.path, maskmapMethod, textureData.attributeName);
                        if (load.data) {
                            maskTexture = load.data;
                        }
                        material.diffusePass.addMethod(maskmapMethod);
                        maskmapMethod.maskTexture = maskTexture;
                    }
                    else if (method.type == MatMethodData.streamerMethod) {
                        var streamerMethod: StreamerMethod = new StreamerMethod();
                        var steamerTexture: ITexture = CheckerboardTexture.texture;
                        var textureData: any = method.texturesData[0];

                        load = this.addMethodImgTask(textureData.path, streamerMethod, textureData.attributeName);
                        if (load.data) {
                            steamerTexture = load.data;
                        }
                        streamerMethod.speedU = method.uSpeed;
                        streamerMethod.speedV = method.vSpeed;
                        streamerMethod.start(true);
                        material.diffusePass.addMethod(streamerMethod);
                        streamerMethod.steamerTexture = steamerTexture;
                    }
                    else if (method.type == MatMethodData.terrainARGBMethod) {
                        var terrainARGBMethod: TerrainARGBMethod = new TerrainARGBMethod(CheckerboardTexture.texture, CheckerboardTexture.texture, CheckerboardTexture.texture, CheckerboardTexture.texture, CheckerboardTexture.texture);
                        var textureData: any = null;
                        for (var i: number = 0; i < method.texturesData.length; ++i) {
                            textureData = method.texturesData[i];

                            load = this.addMethodImgTask(textureData.path, terrainARGBMethod, textureData.attributeName);
                            if (load.data) {
                                terrainARGBMethod[textureData.attrName] = load.data;
                            }


                            if (i != 0) {
                                terrainARGBMethod.setUVTitling(i - 1, textureData.uvTitlingX, textureData.uvTitlingY);
                            }
                        }

                        material.diffusePass.addMethod(terrainARGBMethod);
                    }
                }
            }

            mesh.lightGroup = this.lightGroup;

        }
        //灯光
        private createLight(): void {
            var mapLightData: MapLightData = null;
            for (var key in this._mapXmlParser.lightDict) {

                mapLightData = this._mapXmlParser.lightDict[key];

                if (mapLightData.type == LightType.directlight && this._mapXmlParser.directLight) {
                    var dirLight: DirectLight = new DirectLight(mapLightData.direction);
                    dirLight.lightId = Number(mapLightData.id);
                    dirLight.diffuse = mapLightData.diffuseColor;

                    dirLight.ambient = mapLightData.ambientColor;
                    dirLight.halfIntensity = mapLightData.halfIntensity;
                    dirLight.intensity = mapLightData.intensity;

                    this.lightGroup.addLight(dirLight);

                } else if (mapLightData.type == LightType.pointlight && this._mapXmlParser.pointLight) {
                    var pLight: PointLight = new PointLight(0);
                    pLight.lightId = Number(mapLightData.id);
                    pLight.position = mapLightData.position;

                    pLight.ambient = mapLightData.ambientColor;
                    pLight.diffuse = mapLightData.diffuseColor;
                    pLight.radius = mapLightData.radius;

                    pLight.falloff = mapLightData.falloff;
                    pLight.intensity = mapLightData.intensity;
                    this.lightGroup.addLight(pLight);
                }
            }

        }
    }
}