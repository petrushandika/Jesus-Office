export type Persona = {
  id: string; name: string; role: string;
  robe: string; mantle: string; hair: string; skin: string;
  beard: boolean; height: number; build: number;
  hairStyle: 'long' | 'short' | 'bald';
};

// Artistic personas, not historical likenesses or proof of assigned agent work.
// Matthias is used in the post-replacement roster; James and Judas are disambiguated.
export const PERSONAS: Persona[] = [
  { id:'yesus', name:'Yesus', role:'Figur utama', robe:'#f4ead7', mantle:'#9b443b', hair:'#3c281e', skin:'#b98360', beard:true, height:1.08, build:1, hairStyle:'long' },
  { id:'petrus', name:'Petrus', role:'Simon Petrus', robe:'#c3aa7c', mantle:'#566b76', hair:'#74695c', skin:'#b8825e', beard:true, height:1.02, build:1.15, hairStyle:'short' },
  { id:'andreas', name:'Andreas', role:'Saudara Petrus', robe:'#b6b5a0', mantle:'#516b57', hair:'#49382d', skin:'#c19370', beard:true, height:1.04, build:0.92, hairStyle:'long' },
  { id:'yakobus-zebedeus', name:'Yakobus (Zebedeus)', role:'Anak Zebedeus', robe:'#c59c70', mantle:'#835340', hair:'#3a2b24', skin:'#a77050', beard:true, height:1.08, build:1.08, hairStyle:'short' },
  { id:'yohanes', name:'Yohanes', role:'Saudara Yakobus', robe:'#ddd1b6', mantle:'#697f86', hair:'#3d2a20', skin:'#c18e6b', beard:false, height:0.96, build:0.88, hairStyle:'long' },
  { id:'filipus', name:'Filipus', role:'Murid dari Betsaida', robe:'#b9b594', mantle:'#8c6b45', hair:'#5b4231', skin:'#bc8864', beard:true, height:1.01, build:0.96, hairStyle:'short' },
  { id:'bartolomeus', name:'Bartolomeus', role:'Salah satu dari dua belas', robe:'#cfb998', mantle:'#59645a', hair:'#332920', skin:'#a87556', beard:true, height:1.07, build:0.91, hairStyle:'long' },
  { id:'tomas', name:'Tomas', role:'Disebut Didimus', robe:'#c4b3a2', mantle:'#735f78', hair:'#352921', skin:'#b47e59', beard:true, height:0.98, build:0.95, hairStyle:'short' },
  { id:'matius', name:'Matius', role:'Salah satu dari dua belas', robe:'#d3c7a2', mantle:'#567476', hair:'#4d3729', skin:'#bd906e', beard:true, height:0.99, build:1.08, hairStyle:'short' },
  { id:'yakobus-alfeus', name:'Yakobus (Alfeus)', role:'Anak Alfeus', robe:'#b8a08c', mantle:'#7e805b', hair:'#807365', skin:'#b58160', beard:true, height:0.94, build:0.96, hairStyle:'bald' },
  { id:'tadeus', name:'Tadeus', role:'Yudas, bukan Iskariot', robe:'#c7b48f', mantle:'#805d4e', hair:'#4a3428', skin:'#b37d5a', beard:true, height:1.03, build:1.03, hairStyle:'long' },
  { id:'simon', name:'Simon orang Zelot', role:'Salah satu dari dua belas', robe:'#b5b199', mantle:'#4e6268', hair:'#756b60', skin:'#a97151', beard:true, height:1.0, build:1.1, hairStyle:'bald' },
  { id:'matias', name:'Matias', role:'Pengganti Yudas Iskariot', robe:'#c5bea8', mantle:'#8b7853', hair:'#3c2c23', skin:'#bf8b67', beard:true, height:1.02, build:0.94, hairStyle:'short' },
];
