'use client';
import React, { useEffect, useState, useRef } from 'react';
import mapboxgl, { GeoJSONSource ,AnyLayer, MapboxGeoJSONFeature} from 'mapbox-gl';
import MapboxLanguage from '@mapbox/mapbox-gl-language';
import 'mapbox-gl/dist/mapbox-gl.css';
import DropZone from './DropFile';
import {GeoJSONFeature,GeoJSON,GeoJSONFeatureCollection} from "@mapbox/geojson-types"
import {saveAs} from 'file-saver'

const EDITLAYER="editlayer";
const UUIDKEY="uuid_key_2fs423f9j2r32joif09";

const regeojson=new RegExp(/(?<filename>.+)\.geojson/);
const addedSource=new RegExp(/added_data_(?<filename>.+)/);


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


const layers=new Map<string,GeoJSONFeature[]>();
const editingFeature:{feature:GeoJSONFeatureCollection|null,selected:string|null,layername:string|null}={feature:null,selected:null,layername:null};

export default function SimpleMap() {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_KEY??"";
    const mapContainer = useRef(null);
    const [map, setMap] = useState<mapboxgl.Map|null>(null);

    const [currentMode,setCurrentMode]=useState<"Spectate"|"EditMode"|"Selected">("Spectate");
    const [mapclick,setmapclick]=useState<mapboxgl.MapMouseEvent&mapboxgl.EventData|null>(null);
    const [layerlist,setLayerList]=useState<string[]>([]);

    useEffect(()=>{
        if(mapclick!=null){
            if(map==null){
                console.log("Map not loaded");
                return;
            }
            const f=map.queryRenderedFeatures(mapclick.point);
            
            // マップ上をクリックしたとき
            if(currentMode=="Spectate"){
                for(let i=0;i<f.length;i++){
                    const regex=f[i].layer.id.match(addedSource);
                    if(regex){
                        const filename=regex.groups!["filename"];
                        new mapboxgl.Popup({closeOnClick:true}).setLngLat(mapclick.lngLat).setHTML(`<pre>${JSON.stringify(f[i].properties,null,4)}</pre>`).addTo(map);
                    }
                }
            }
            else if(currentMode=="EditMode"){
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
                                featurecollection.features.push(
                                    {
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
            else{
                for(let i=0;i<f.length;i++){
                    if(f[i].id!==EDITLAYER+"-POINT"&&f[i].properties!["point-type"]=="grabbable"){
                        editingFeature.selected=f[i].properties![UUIDKEY];
                        break;
                    }
                }
            }
            setmapclick(null);
        }
    },[currentMode,mapclick,map]);

    useEffect(()=>{
        if(currentMode=="Spectate"){
            map?.setLayoutProperty(EDITLAYER+"-POINT","visibility","none");
            map?.setLayoutProperty(EDITLAYER,"visibility","none");
        }
        else{
            map?.setLayoutProperty(EDITLAYER+"-POINT","visibility","visible");
            map?.setLayoutProperty(EDITLAYER,"visibility","visible");
        }
    },[map,currentMode]);

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

    function clickModeButton(){
        if(currentMode=="Spectate"){
            setCurrentMode("EditMode");
        }
        else{
            setCurrentMode("Spectate");
        }
    }
    function applyEdit(){
        if(!editingFeature.feature){
            return;
        }
        if(!editingFeature.layername||!editingFeature.feature){
            return;
        }
        if(!map){
            return;
        }
        const uuid:string=editingFeature.feature.features[0].properties![UUIDKEY];
        
        const feature=layers.get(editingFeature.layername)!.find((f)=>f.properties![UUIDKEY]==uuid)!;
        feature.geometry=editingFeature.feature.features[0].geometry;
        const geojsonsource=map.getSource(editingFeature.layername) as GeoJSONSource;
        geojsonsource.setData({
            type:"FeatureCollection",
            features:layers.get(editingFeature.layername)! as any
        });
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
                style:"/std.json",
            });
            // 言語変更設定参考
            // defaultLanguageとしてjaを指定
            const language = new MapboxLanguage({ defaultLanguage: 'ja' });
            map.addControl(language);
            
            const movemouse=(e:mapboxgl.MapMouseEvent & mapboxgl.EventData)=>{
                if(!editingFeature.feature||!editingFeature.selected){
                    return;
                }
                const f=map.queryRenderedFeatures(e.point);
                for(let i=0;i<f.length;i++){
                    if(f[i].id!==EDITLAYER+"-POINT"&&f[i].properties!["point-type"]=="grabbable"){
                        editingFeature.selected=f[i].properties![UUIDKEY];
                        break;
                    }
                }
                const editsource=map.getSource(EDITLAYER) as GeoJSONSource;
                const coords=[e.lngLat.lng,e.lngLat.lat];
                for(let i=1;i<editingFeature.feature.features.length;i++){
                    if(editingFeature.feature.features[i].properties![UUIDKEY]==editingFeature.selected){
                        editingFeature.feature.features[i].geometry!.coordinates=coords;
                        editingFeature.feature.features[0].geometry!.coordinates[i-1]=coords;
                        editsource.setData(editingFeature.feature as any);
                        break;
                    }
                }
            }
            function mouseup(e:mapboxgl.MapMouseEvent & mapboxgl.EventData){
                map.off("mousemove",movemouse);
                map.off("touchmove",movemouse);
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
                map.on("click",(e)=>{
                    setmapclick(e);
                });
                // 編集時ドラッグ

                map.on("mousedown",EDITLAYER+"-POINT",(e)=>{
                    if(mapclick==null)setmapclick(e);
                    e.preventDefault();
                    map.on("mousemove",movemouse);
                    map.once("mouseup",mouseup);
                });
                map.on("touchstart",EDITLAYER+"-POINT",(e)=>{
                    e.preventDefault();
                    map.on("touchmove",movemouse);
                    map.once("touchend",mouseup);
                })
            });

            
        };

        if (!map) initializeMap({ setMap, mapContainer });
    }, [map,currentMode]);

    return (
        <DropZone onDropFile={onDropFile}>
            <div ref={mapContainer} className='w-full h-screen' />
            <div className="absolute p-3 w-52 top-0 right-0">
                <div>
                <p><button className="border-2 border-white bg-green-300 rounded-md hover:bg-green-500 active:bg-green-700" onClick={clickModeButton}>{currentMode}</button></p>
                <p><button className="border-2 border-white bg-green-300 rounded-md disabled:bg-slate-400 hover:bg-green-500 active:bg-green-700" onClick={applyEdit} disabled={currentMode!="Selected"}>Apply</button></p>
                </div>
                <div className='border-2 border-black bg-white rounded-md'>
                    {layerlist.map((l)=>{return <li key={l}>{l}<button className='border-1 border-black rounded-md bg-green-300 disabled:bg-slate-400 hover:bg-green-500 active:bg-green-700'  disabled={currentMode!="Spectate"} onClick={clickDownload} data-filename={l}>{"Download"}</button></li>})}
                </div>
            </div>
        </DropZone>
    );
}

