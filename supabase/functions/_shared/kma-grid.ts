export type PointEnvironment = {
  terrain?: "sand" | "rock" | "harbor" | "mixed" | null;
  exposure?: "low" | "medium" | "high" | null;
  breakwaterShelter?: "low" | "medium" | "high" | null;
  swellSensitivity?: "low" | "medium" | "high" | null;
  eastWindSensitivity?: "low" | "medium" | "high" | null;
  onshoreWindSensitivity?: "low" | "medium" | "high" | null;
  exposureDirection?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | null;
};

export type SnorkyPoint = {
  id: string | number;
  name: string;
  region_id?: string | number | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  environment?: PointEnvironment | null;
  warning_area_code?: string | null;
  land_warning_area_code?: string | null;
  updated_at?: string | null;
};
export type GridPoint = { id: string | number; name: string; region: string | null; latitude: number; longitude: number; environment?: PointEnvironment | null; warning_area_code?: string | null; land_warning_area_code?: string | null };
export type GridGroup = { gridKey: string; nx: number; ny: number; points: GridPoint[] };

const BOUNDS={minLat:32,maxLat:39.8,minLon:124,maxLon:132};
const finite=(value:unknown)=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;

// KMA official DFS Lambert Conformal Conic constants.
export function toKmaGrid(latitude:number,longitude:number){
  const RE=6371.00877,GRID=5,SLAT1=30,SLAT2=60,OLON=126,OLAT=38,XO=43,YO=136,DEGRAD=Math.PI/180;
  const re=RE/GRID,slat1=SLAT1*DEGRAD,slat2=SLAT2*DEGRAD,olon=OLON*DEGRAD,olat=OLAT*DEGRAD;
  let sn=Math.tan(Math.PI*.25+slat2*.5)/Math.tan(Math.PI*.25+slat1*.5);sn=Math.log(Math.cos(slat1)/Math.cos(slat2))/Math.log(sn);
  let sf=Math.tan(Math.PI*.25+slat1*.5);sf=Math.pow(sf,sn)*Math.cos(slat1)/sn;
  let ro=Math.tan(Math.PI*.25+olat*.5);ro=re*sf/Math.pow(ro,sn);
  let ra=Math.tan(Math.PI*.25+latitude*DEGRAD*.5);ra=re*sf/Math.pow(ra,sn);
  let theta=longitude*DEGRAD-olon;if(theta>Math.PI)theta-=2*Math.PI;if(theta< -Math.PI)theta+=2*Math.PI;theta*=sn;
  return{nx:Math.floor(ra*Math.sin(theta)+XO+.5),ny:Math.floor(ro-ra*Math.cos(theta)+YO+.5)};
}

export function buildKmaGridRegistry(points:SnorkyPoint[]){
  const groups=new Map<string,GridGroup>(),invalidPoints:Array<Record<string,unknown>>=[];
  for(const point of points){
    const latitude=finite(point.lat??point.latitude),longitude=finite(point.lng??point.longitude);
    if(latitude===null||longitude===null||latitude<BOUNDS.minLat||latitude>BOUNDS.maxLat||longitude<BOUNDS.minLon||longitude>BOUNDS.maxLon){invalidPoints.push({id:point.id,name:point.name,reason:"invalid-coordinate"});continue}
    const {nx,ny}=toKmaGrid(latitude,longitude),gridKey=`${nx}:${ny}`;
    if(!groups.has(gridKey))groups.set(gridKey,{gridKey,nx,ny,points:[]});
    groups.get(gridKey)!.points.push({id:point.id,name:point.name,region:point.region??null,latitude,longitude});
  }
  return{totalActivePoints:points.length,validCoordinatePoints:points.length-invalidPoints.length,invalidCoordinatePoints:invalidPoints.length,uniqueGridCount:groups.size,grids:[...groups.values()],invalidPoints};
}
