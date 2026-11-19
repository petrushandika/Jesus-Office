// Bounded background neighborhoods; never claim an infinite procedural world.
export const CITY_EXTENT = 135;
const noise = (x: number, z: number, salt: number) => { const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453; return v - Math.floor(v); };
export function createSurroundingHomes() {
 const homes: {x:number;z:number;width:number;depth:number;height:number}[]=[];
 for(let z=-126;z<=126;z+=9)for(let x=-126;x<=126;x+=9){
  // Keep original authored town, landmark bounds and citizen routes untouched.
  if(Math.abs(x)<=42&&Math.abs(z)<=39)continue;
  // Varied plot sizes and setbacks; lots stay inside the 9 m block between lanes.
  const width=4.1+noise(x,z,1)*1.9, depth=4+noise(x,z,2)*2;
  homes.push({x:x+(noise(x,z,3)-.5)*(6-width)*.8,z:z+(noise(x,z,4)-.5)*(6-depth)*.8,width,depth,height:1.9+noise(x,z,5)*2.3});
 }
 return homes;
}
