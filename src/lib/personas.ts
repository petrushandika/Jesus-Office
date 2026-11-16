export type Persona = {
  id: string; name: string; role: string;
  robe: string; mantle: string; hair: string; skin: string;
  beard: boolean; height: number; build: number;
  hairStyle: 'long' | 'short' | 'bald';
};

// Documented visual team roles only; not a live agent registry or assignments.
export const PERSONAS: Persona[] = [
  { id:'yesus', name:'Yesus', role:'Leader', robe:'#f4ead7', mantle:'#9b443b', hair:'#3c281e', skin:'#b98360', beard:true, height:1.08, build:1, hairStyle:'long' },
  { id:'petrus', name:'Petrus', role:'Software Architect', robe:'#c3aa7c', mantle:'#566b76', hair:'#74695c', skin:'#b8825e', beard:true, height:1.02, build:1.15, hairStyle:'short' },
  { id:'yohanes', name:'Yohanes', role:'Senior Engineer', robe:'#ddd1b6', mantle:'#697f86', hair:'#3d2a20', skin:'#c18e6b', beard:false, height:0.96, build:0.88, hairStyle:'long' },
  { id:'yakobus-zebedeus', name:'Yakobus (Zebedeus)', role:'QA & Security', robe:'#c59c70', mantle:'#835340', hair:'#3a2b24', skin:'#a77050', beard:true, height:1.08, build:1.08, hairStyle:'short' },
  { id:'andreas', name:'Andreas', role:'Research Engineer', robe:'#b6b5a0', mantle:'#516b57', hair:'#49382d', skin:'#c19370', beard:true, height:1.04, build:0.92, hairStyle:'long' },
  { id:'filipus', name:'Filipus', role:'Product Planner', robe:'#b9b594', mantle:'#8c6b45', hair:'#5b4231', skin:'#bc8864', beard:true, height:1.01, build:0.96, hairStyle:'short' },
  { id:'matius', name:'Matius', role:'Technical Writer', robe:'#d3c7a2', mantle:'#567476', hair:'#4d3729', skin:'#bd906e', beard:true, height:0.99, build:1.08, hairStyle:'short' },
];
