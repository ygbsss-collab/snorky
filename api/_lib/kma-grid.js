"use strict";

const KOREA_BOUNDS={minLat:32,maxLat:39.8,minLon:124,maxLon:132};

function toFiniteNumber(value){
  if(value===null||value===undefined||value==="")return null;
  const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;
}

// KMA DFS Lambert Conformal Conic conversion (official grid constants).
function toKmaGrid(latitude,longitude){
  const lat=toFiniteNumber(latitude),lon=toFiniteNumber(longitude);
  if(lat===null||lon===null)throw new TypeError("Valid latitude and longitude are required");
  const RE=6371.00877,GRID=5,SLAT1=30,SLAT2=60,OLON=126,OLAT=38,XO=43,YO=136;
  const DEGRAD=Math.PI/180,re=RE/GRID,slat1=SLAT1*DEGRAD,slat2=SLAT2*DEGRAD,olon=OLON*DEGRAD,olat=OLAT*DEGRAD;
  let sn=Math.tan(Math.PI*.25+slat2*.5)/Math.tan(Math.PI*.25+slat1*.5);
  sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(sn);
  let sf=Math.tan(Math.PI*.25+slat1*.5);sf=Math.pow(sf,sn)*Math.cos(slat1)/sn;
  let ro=Math.tan(Math.PI*.25+olat*.5);ro=re*sf/Math.pow(ro,sn);
  let ra=Math.tan(Math.PI*.25+lat*DEGRAD*.5);ra=re*sf/Math.pow(ra,sn);
  let theta=lon*DEGRAD-olon;if(theta>Math.PI)theta-=2*Math.PI;if(theta< -Math.PI)theta+=2*Math.PI;theta*=sn;
  return{nx:Math.floor(ra*Math.sin(theta)+XO+.5),ny:Math.floor(ro-ra*Math.cos(theta)+YO+.5)};
}

function buildKmaGridRegistry(points=[]){
  const grids=new Map(),invalidPoints=[];
  for(const point of points){
    const latitude=toFiniteNumber(point?.lat??point?.latitude),longitude=toFiniteNumber(point?.lng??point?.longitude);
    if(latitude===null||longitude===null||latitude<KOREA_BOUNDS.minLat||latitude>KOREA_BOUNDS.maxLat||longitude<KOREA_BOUNDS.minLon||longitude>KOREA_BOUNDS.maxLon){
      invalidPoints.push({id:point?.id??null,name:point?.name??null,latitude,longitude,reason:"invalid-coordinate"});continue;
    }
    const {nx,ny}=toKmaGrid(latitude,longitude),gridKey=`${nx}:${ny}`;
    if(!grids.has(gridKey))grids.set(gridKey,{gridKey,nx,ny,points:[]});
    grids.get(gridKey).points.push({id:point.id,name:point.name,region:point.region??point.region_name??null,latitude,longitude});
  }
  return{totalActivePoints:points.length,validCoordinatePoints:points.length-invalidPoints.length,invalidCoordinatePoints:invalidPoints.length,uniqueGridCount:grids.size,grids:[...grids.values()],invalidPoints};
}

module.exports={KOREA_BOUNDS,toKmaGrid,buildKmaGridRegistry};
