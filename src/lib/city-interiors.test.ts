import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=()=>readFileSync(new URL('../components/office/city-landmarks.tsx',import.meta.url),'utf8');
test('landmarks have differentiated cutaway domestic interiors',()=>{
 const s=source();for(const name of ['bath-pool','market-produce','pottery-wheel','reading-porch','garden-rest'])assert.ok(s.includes(name),name);
 assert.doesNotMatch(s,/Drum at=\{\[0, 1\.8, 0\]\} radius=\{2\.6\}/,'bath center is not a solid cylinder');
});
