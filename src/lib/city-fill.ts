// Bounded background neighborhoods; never claim an infinite procedural world.
export const CITY_EXTENT = 135;
export function createSurroundingHomes() {
 const homes: {x:number;z:number;width:number;depth:number;height:number}[]=[];
 for(let z=-126;z<=126;z+=9)for(let x=-126;x<=126;x+=9){
  // Keep original authored town, landmark bounds and citizen routes untouched.
  if(Math.abs(x)<=42&&Math.abs(z)<=39)continue;
  const seed=Math.abs(x*17+z*31);
  homes.push({x,z,width:5.2+(seed%5)*.18,depth:5.1+(seed%7)*.12,height:2.1+(seed%9)*.22});
 }
 return homes;
}
