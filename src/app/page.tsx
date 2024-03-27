'use client';
import * as turf from '@turf/turf';
import React, { useEffect, useState, useRef } from 'react';
import mapboxgl, { GeoJSONSource } from 'mapbox-gl';
import MapboxLanguage from '@mapbox/mapbox-gl-language';
import 'mapbox-gl/dist/mapbox-gl.css';
import DropZone from './DropFile';
import {saveAs} from 'file-saver'
import { createRoot } from 'react-dom/client';
import {GeoJSONFeature,GeoJSON,GeoJSONFeatureCollection} from "@/types/geojson"


const EDITLAYER="editlayer";
const UUIDKEY="uuid_key_2fs423f9j2r32joif09";

const regeojson=new RegExp(/(?<filename>.+)\.geojson/);
const addedSource=new RegExp(/added_data_(?<filename>.+)/);
const mouseState={down:false};

function randomColor(seed?:string){
    const encoder=new TextEncoder();
    const rnd=seed?encoder.encode(seed):new Uint8Array([Math.floor(Math.random()*256),Math.floor(Math.random()*256),Math.floor(Math.random()*256)]);

    let rgb:number[]=[49,9,134];
    for(let i=0;i<rnd.length;i++){
        rgb[i%3]=(rgb[i%3]+rnd[i])%256;
    }

    const hexstr="#"+("00"+rgb[0].toString(16)).slice(-2)+("00"+rgb[1].toString(16)).slice(-2)+("00"+rgb[2].toString(16)).slice(-2);
    return hexstr;
}

function propertiesTable(properties:{[key:string]:any}){
    const keys=Object.keys(properties).filter((k)=>k!=UUIDKEY);

    return (
        <table className='w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400'>
            <tbody>
                {keys.map((k)=>{
                    return (<tr key={k} className='bg-white border-b dark:bg-gray-800 dark:border-gray-700'>
                        <th scope='row' className='p-3 font-medium text-gray-900 whitespace-nowrap dark:text-white'>{k}</th>
                        <td className='p-3'>{properties[k]}</td>
                        </tr>)
                })}
            </tbody>
        </table>
    )
}

type EditorMode="Spectate"|"Edit"|"Selected"|"Create";
const layers=new Map<string,GeoJSONFeature[]>();
const editingFeature:{feature:GeoJSONFeatureCollection|null,selected:string|null,layername:string|null}={feature:null,selected:null,layername:null};

export default function SimpleMap() {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_KEY??"";
    const mapContainer = useRef(null);
    const [map, setMap] = useState<mapboxgl.Map|null>(null);

    /**
     * レイヤー名表示用
     */
    const [layerlist,setLayerList]=useState<string[]>([]);
    const [currentMode,setCurrentMode]=useState<EditorMode>("Spectate");
    const currentModeRef=useRef<EditorMode>("Spectate");
    currentModeRef.current=currentMode;

    const onDropFile=(file:File)=>{
        console.log("Drop");
        const regex=file.name.match(regeojson);
        if(regex){
            console.log("GeoJson");
            const filename=regex.groups!["filename"];
            const fileid="added_data_"+filename;
            console.log(fileid);
            file.text().then((t)=>{return JSON.parse(t)}).then((t:GeoJSON)=>{
                if(!map){
                    console.log("map not loaded");
                    return;
                }
                if(t.type=="Feature"){
                    const uuid=crypto.randomUUID();
                    t.properties![UUIDKEY]=uuid;
                }
                else if(t.type=="FeatureCollection"){
                    for(let i=0;i<t.features.length;i++){
                        const uuid=crypto.randomUUID();
                        t.features[i].properties![UUIDKEY]=uuid;
                    }
                }
                else{
                    return;
                }
                if(layers.has(fileid)){
                    console.log("overwrite");
                    const geojsonsource=map.getSource(fileid) as GeoJSONSource;
                    geojsonsource.setData(t as any);
                }
                else{
                    map.addSource(
                        fileid,
                        {
                            "type":"geojson",
                            "data":t as any
                        }
                    );
                    map.addLayer({
                            "id":fileid,
                            "type":"line",
                            "paint": {
                                "line-color":randomColor(fileid),
                                "line-width": ["interpolate",["linear"],["zoom"],8,1,12,4]
                            },
                            "layout": {
                                "line-cap": "round",
                                "line-join": "round"
                            },
                            "source":fileid
                    },EDITLAYER);
                    map.on("mouseenter",fileid,()=>{
                        map!.getCanvas().style.cursor="pointer";
                    });
                    map.on("mouseleave",fileid,()=>{
                        map!.getCanvas().style.cursor="";
                    });
                    setLayerList([...layerlist,filename]);
                }
                layers.set(fileid,t.type=="Feature"?[t]:t.features);
            });
        }
        else{
            console.log("Not a GeoJson");
        }
    }

    function setEditLayerVisibility(visible:boolean){
        if(!map){
            console.log("Map not loaded");
            return;
        }
        if(visible){
            map.setLayoutProperty(EDITLAYER+"-POINT","visibility","visible");
            map.setLayoutProperty(EDITLAYER,"visibility","visible");
        }
        else{
            map.setLayoutProperty(EDITLAYER+"-POINT","visibility","none");
            map.setLayoutProperty(EDITLAYER,"visibility","none");
        }
    }

    function clickModeButton(){
        if(currentMode=="Spectate"){
            editingFeature.feature=null;
            editingFeature.layername=null;
            editingFeature.selected=null;
            setEditLayerVisibility(true);
            setCurrentMode("Edit");
        }
        else{
            setEditLayerVisibility(false);
            setCurrentMode("Spectate");
        }
    }
    // 編集を適用
    function applyEdit(){
        if(!editingFeature.layername||!editingFeature.feature){
            return;
        }
        if(!map){
            return;
        }
        const geojsonsource=map.getSource(editingFeature.layername) as GeoJSONSource;
        if(currentModeRef.current=="Selected"){
            const uuid:string=editingFeature.feature.features[0].properties![UUIDKEY];
            
            const feature=layers.get(editingFeature.layername)!.find((f)=>f.properties![UUIDKEY]==uuid)!;
            feature.geometry=editingFeature.feature.features[0].geometry;
            geojsonsource.setData({
                type:"FeatureCollection",
                features:layers.get(editingFeature.layername)! as any
            });
        }
        else if(currentModeRef.current=="Create"){
            const feature=editingFeature.feature.features[1];
            const features=layers.get(editingFeature.layername)!;
            features.push(feature);
            geojsonsource.setData({
                type:"FeatureCollection",
                features:features as any
            });
        }
        else{
            return;
        }
        setEditLayerVisibility(false);
        setCurrentMode("Spectate");
    }

    function clickDownload(e:React.MouseEvent<HTMLElement>){
        const filename=e.currentTarget.getAttribute("data-filename");
        if(!filename){
            return;
        }
        console.log(`Download\n${filename}`);
        const features=layers.get("added_data_"+filename)!;

        let filedata=`{\n\"type\":\"FeatureCollection\",\n\"name\":\"${filename}\",\n\"features\":[`;
        for(let i=0;i<features.length;i++){
            const feature=JSON.parse(JSON.stringify(features[i]));
            delete feature["properties"][UUIDKEY];
            filedata+=JSON.stringify(feature)+((i==features.length-1)?"\n":",\n");
        }
        filedata+="]}";
        const blob=new Blob([filedata],{type:"text/plain"});
        saveAs(blob,filename+".geojson");
    }
    // 削除
    function clickDelete(e:React.MouseEvent<HTMLElement>){
        if(!map){
            return;
        }
        const filename=e.currentTarget.getAttribute("data-filename");
        console.log("Delete");
        console.log(filename);
        const layerid="added_data_"+filename;
        map.removeLayer(layerid);
        map.removeSource(layerid);
        layers.delete(layerid);
        setLayerList(layerlist.filter((l)=>l!=filename));
    }
    function clickCreateButton(e:React.MouseEvent<HTMLElement>){
        if(!map){
            return;
        }
        const filename=e.currentTarget.getAttribute("data-filename");
        if(!filename){
            return;
        }
        if(currentMode=="Edit"){
            setCurrentMode("Create");
            editingFeature.feature={
                type:"FeatureCollection",
                features:[
                    {type:"Feature",properties:{},geometry:{
                        type:"Point",
                        coordinates:[0,90]
                    }},
                    {type:"Feature",properties:{
                        "uuid_key_2fs423f9j2r32joif09":crypto.randomUUID()
                    },geometry:{
                        type:"LineString",
                        coordinates:[]
                    }}
                ]
            };
            editingFeature.layername="added_data_"+filename;
            editingFeature.selected=null;
            const geojsonsource=map.getSource(EDITLAYER)! as GeoJSONSource;
            geojsonsource.setData(editingFeature.feature as any);
        }
    }

    useEffect(() => {
        const initializeMap = ({
            setMap,
            mapContainer,
        }: {
            setMap: any;
            mapContainer: any;
        }) => {
            const map = new mapboxgl.Map({
                container: mapContainer.current,
                center: [136.88182959193895,35.17103308865671],
                zoom: 15,
                maxPitch:0,
                minZoom:5,
                style:"/std.json"
            });
            // 言語変更設定参考
            // defaultLanguageとしてjaを指定
            const language = new MapboxLanguage({ defaultLanguage: 'ja' });
            map.addControl(language);

            function mouseClick(e:mapboxgl.MapMouseEvent & mapboxgl.EventData){
                if(map==null){
                    console.log("Map not loaded");
                    return;
                }
                const f=map.queryRenderedFeatures(e.point);
                console.log(f);
                // マップ上をクリックしたとき
                if(currentModeRef.current=="Spectate"){
                    for(let i=0;i<f.length;i++){
                        const regex=f[i].layer.id.match(addedSource);
                        if(regex){
                            const filename=regex.groups!["filename"];
                            const div=document.createElement("div");
                            createRoot(div).render(propertiesTable(f[i].properties!));
                            new mapboxgl.Popup({closeOnClick:true,closeButton:false}).setLngLat(e.lngLat).setDOMContent(div).addTo(map);
                        }
                    }
                }
                else if(currentModeRef.current=="Edit"){
                    for(let i=0;i<f.length;i++){
                        const regex=f[i].layer.id.match(addedSource);
                        if(regex){
                            const layerid=f[i].layer.id;
                            const layer=layers.get(layerid);
                            if(!layer){
                                console.log(`${layerid} not found`);
                                return;
                            }
                            const properties=f[i].properties!;
                            const uuid:string=properties[UUIDKEY];
                            const editsource=map.getSource(EDITLAYER) as GeoJSONSource;
                            const feature=JSON.parse(JSON.stringify(layers.get(layerid)!.find((f)=>f.properties![UUIDKEY]==uuid))) as GeoJSONFeature;
                            if(!feature||!feature.geometry){
                                return;
                            }
                            const featurecollection:GeoJSONFeatureCollection={
                                type:"FeatureCollection",
                                features:[
                                    feature
                                ]
                            }
                                if(feature.geometry.type=="LineString"){
                                for(let p=0;p<feature.geometry.coordinates.length;p++){
                                    featurecollection.features.push({
                                            type:"Feature",
                                            properties:{
                                                "point-type":"grabbable",
                                                "uuid_key_2fs423f9j2r32joif09":crypto.randomUUID()
                                            },
                                            geometry:{
                                                type:"Point",
                                                coordinates:feature.geometry.coordinates[p]
                                            }
                                        }
                                    )
                                }
                            }
        
                            editsource.setData(featurecollection as any);
                            editingFeature.feature=featurecollection;
                            editingFeature.selected=null;
                            editingFeature.layername=layerid;
                            setCurrentMode("Selected");
                            break;
                        }
                    }
                }
                else if(currentModeRef.current=="Selected"){
                    for(let i=0;i<f.length;i++){
                        if(f[i].id!==EDITLAYER+"-POINT"&&f[i].properties!["point-type"]=="grabbable"){
                            editingFeature.selected=f[i].properties![UUIDKEY];
                            break;
                        }
                    }
                }
                else if(currentModeRef.current=="Create"){
                    if(!editingFeature.feature){
                        return;
                    }
                    const lgeo=editingFeature.feature.features[1].geometry;
                    if(!lgeo||lgeo.type!="LineString"){
                        return;
                    }
                    lgeo.coordinates.push([e.lngLat.lng,e.lngLat.lat]);
                    const geojsonsource=map.getSource(EDITLAYER)! as GeoJSONSource;
                    geojsonsource.setData(editingFeature.feature as any);
                }
            }
            
            // 点をドラッグ中
            function movemouse(e:mapboxgl.MapMouseEvent & mapboxgl.EventData){
                if(currentModeRef.current=="Selected"&&mouseState.down==true){
                    if(!editingFeature.feature||!editingFeature.selected){
                        return;
                    }
                    const coords:[number,number]=[e.lngLat.lng,e.lngLat.lat];
                    const zoomlv=map.getZoom();
                    const f=map.queryRenderedFeatures(e.point);
                    for(let i=0;i<f.length;i++){
                        if(f[i].layer.id.match(addedSource)){
                            const id=f[i].layer.id;
                            const uuid=f[i].properties![UUIDKEY];
                            const feature=layers.get(id)!.find((f)=>f.properties![UUIDKEY]==uuid);
                            if(!feature){
                                continue;
                            }
                            if(feature.geometry!.type=="LineString"){
                                const len=feature.geometry?.coordinates.length;
                                if(!len){
                                    continue;
                                }
                                const hpos=feature.geometry!.coordinates[0];
                                const tpos=feature.geometry!.coordinates[len-1];
                                const dh=turf.distance([hpos[0],hpos[1]],coords,{units:"meters"});
                                const dt=turf.distance([tpos[0],tpos[1]],coords,{units:"meters"});
                                
                                if(dh/zoomlv<0.7){
                                    coords[0]=hpos[0];
                                    coords[1]=hpos[1];
                                    break;
                                }
                                if(dt/zoomlv<0.7){
                                    coords[0]=tpos[0];
                                    coords[1]=tpos[1];
                                    break;
                                }
                            }
                        }
                    }
                    const editsource=map.getSource(EDITLAYER) as GeoJSONSource;
                    for(let i=1;i<editingFeature.feature.features.length;i++){
                        if(editingFeature.feature.features[i].properties![UUIDKEY]==editingFeature.selected){
                            const pgeo=editingFeature.feature.features[i].geometry;
                            const lgeo=editingFeature.feature.features[0].geometry;
                            if((!pgeo||!lgeo)||(pgeo.type!="Point"||lgeo.type!="LineString")){
                                return;
                            }
                            pgeo.coordinates=coords;
                            lgeo.coordinates[i-1]=coords;
                            editsource.setData(editingFeature.feature as any);
                            break;
                        }
                    }
                }
                else if(currentModeRef.current=="Create"){
                    if(!editingFeature.feature){
                        return;
                    }
                    const geojsonsource=map.getSource(EDITLAYER)! as GeoJSONSource;

                    const geometry=editingFeature.feature.features[0].geometry;
                    if(!geometry||geometry.type!="Point"){
                        return;
                    }
                    geometry.coordinates=[e.lngLat.lng,e.lngLat.lat];

                    geojsonsource.setData(editingFeature.feature as any);
                }
            }
            function mouseup(e:mapboxgl.MapMouseEvent & mapboxgl.EventData){
                mouseState.down=false;
                editingFeature.selected=null;
            }
            function mouseDown(e:mapboxgl.MapMouseEvent & mapboxgl.EventData){
                mouseState.down=true;
                if(currentModeRef.current=="Selected"){
                    mouseClick(e);
                    if(editingFeature.selected){
                        e.preventDefault();
                    }
                }
            }

            map.on('load', () => {
                setMap(map);
                map.resize();
                // 編集時に表示するレイヤー
                map.addSource(
                    EDITLAYER,
                    {
                        "type":"geojson",
                        "data":{
                            "type": "FeatureCollection",
                            "features": []
                        }
                    }
                );
                map.addLayer({
                    "id":EDITLAYER+"-POINT",
                    "type":"circle",
                    "paint": {
                        "circle-radius":8,
                        "circle-color":"#FF0000"
                    },
                    "layout": {
                        "visibility":"none"
                    },
                    "source":EDITLAYER
                });
                map.addLayer({
                    "id":EDITLAYER,
                    "type":"line",
                    "paint": {
                        "line-color":"#FF0000",
                        "line-width": 8
                    },
                    "layout": {
                        "visibility":"none",
                        "line-cap": "round",
                        "line-join": "round"
                    },
                    "source":EDITLAYER
                },EDITLAYER+"-POINT");
                map.on("mouseenter",EDITLAYER+"-POINT",()=>{
                    map!.getCanvas().style.cursor="pointer";
                });
                map.on("mouseleave",EDITLAYER+"-POINT",()=>{
                    map!.getCanvas().style.cursor="";
                });
                map.on("click",mouseClick);
                // 編集時ドラッグ
                map.on("mousedown",mouseDown);
                map.on("touchstart",mouseDown);
                map.on("mouseup",mouseup);
                map.on("touchend",mouseup);
                map.on("mousemove",movemouse);
                map.on("touchmove",movemouse);
            });

            
        };

        if (!map) initializeMap({ setMap, mapContainer });
    }, [map,currentMode]);

    return (
        <DropZone onDropFile={onDropFile}>
            <div ref={mapContainer} className='w-full h-screen' />
            <div className="absolute p-3 w-52 top-0 right-0">
                <div>
                <p><button className="border-2 border-white bg-green-300 rounded-md hover:bg-green-500 active:bg-green-700 m-1 w-full" onClick={clickModeButton}>{currentMode}</button></p>
                <p><button className="border-2 border-white bg-green-300 rounded-md disabled:bg-slate-400 hover:bg-green-500 active:bg-green-700 m-1 w-full" onClick={applyEdit} disabled={!(currentMode=="Selected"||currentMode=="Create")}>Apply</button></p>
                </div>
                <div className='border-2 border-black bg-white rounded-md'>
                    {layerlist.map((l)=>{return (
                    <li key={l}>
                        {l}
                        <button className='border-1 border-black rounded-md bg-green-300 disabled:bg-slate-400 hover:bg-green-500 active:bg-green-700'  disabled={currentMode!="Spectate"} onClick={clickDownload} data-filename={l}>{"Download"}</button>
                        <button className='border-1 border-black rounded-md bg-green-300 disabled:bg-slate-400 hover:bg-green-500 active:bg-green-700' disabled={currentMode!="Edit"} onClick={clickCreateButton} data-filename={l}>Create</button>
                        <button className='border-1 border-black rounded-md bg-green-300 disabled:bg-slate-400 hover:bg-green-500 active:bg-green-700'  disabled={currentMode!="Spectate"} onClick={clickDelete} data-filename={l}>{"Del"}</button>
                    </li>
                    )})}
                </div>
            </div>
        </DropZone>
    );
}

