import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('no visible UI copy, even loading and selection',()=>{
 const ui=readFileSync(new URL('../components/office/office.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/<h1|<p\b|persona\.role|Menyiapkan kota|Runtime Hermes live/);
 assert.match(ui,/aria-label/);
});
test('scene contains no glyph-based demo label',()=>{
 const scene=readFileSync(new URL('../components/office/scene.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(scene,/DemoLabel|fillText|<Text\b/);
});
