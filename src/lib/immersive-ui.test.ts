import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('immersive map has no visible roster, arrow controls, or runtime dashboard',()=>{
 const ui=readFileSync(new URL('../components/office/office.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/useSnapshot|Telemetri|Penghuni|<aside|Geser utara|<nav/);
 assert.match(ui,/absolute inset-0/);
 assert.match(ui,/onKeyDown/);
});
