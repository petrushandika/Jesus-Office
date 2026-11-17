import {Vector3} from 'three';

// Includes outer homes, orchards and every landmark; the ground is deliberately unbounded.
export const CITY_CORNERS: [number,number,number][] = [-41,41].flatMap(x=>[0,10].flatMap(y=>[-34,34].map(z=>[x,y,z] as [number,number,number])));
export const CITY_VIEW: [number,number,number] = [16.64525283848835,43.5,-34.56422367047748];
export function fitCityDistance(aspect:number) {
 const back=new Vector3(...CITY_VIEW).normalize();
 const right=new Vector3().crossVectors(new Vector3(0,1,0),back).normalize();
 const up=new Vector3().crossVectors(back,right);
 const vertical=Math.tan(48*Math.PI/360)*0.9;
 const horizontal=vertical*Math.max(0.1,aspect);
 return Math.max(...CITY_CORNERS.map(c=>{
  const p=new Vector3(...c);
  return p.dot(back)+Math.max(Math.abs(p.dot(right))/horizontal,Math.abs(p.dot(up))/vertical);
 }));
}
