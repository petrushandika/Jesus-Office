import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('web metadata uses Jesus Office and distinguishes citizens from workers',()=>{
 const layout=readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8');
 assert.ok(layout.includes('title: "Jesus Office"'), 'web title still hyphenated');
 assert.ok(layout.includes('NPC'), 'metadata must distinguish ambient NPCs');
 assert.ok(!layout.includes('dua belas'), 'do not assert invented agent roster');
});
