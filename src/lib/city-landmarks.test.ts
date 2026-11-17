import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { ExtrudeGeometry, Mesh, MeshBasicMaterial, Raycaster, Shape, Vector3 } from 'three';

const path = new URL('../components/office/city-landmarks.tsx', import.meta.url);

function source() {
  assert.ok(existsSync(path), 'CityLandmarks implementation is missing');
  return readFileSync(path, 'utf8');
}

test('city landmarks provide eight textless volumetric outer-district silhouettes', () => {
  const code = source();
  assert.match(code, /export function CityLandmarks/);
  for (const kind of ['civic-hall', 'bathhouse', 'watchtower', 'market', 'amphitheater', 'aqueduct', 'pottery-workshop', 'terraced-garden']) {
    assert.ok(code.includes(`kind: '${kind}'`), `missing ${kind}`);
  }
  assert.match(code, /name=\{`landmark:\$\{kind\}`\}/);
  assert.match(code, /userData=\{\{ buildingKind: kind \}\}/);
  assert.match(code, /<instancedMesh/);
  assert.match(code, /ExtrudeGeometry/);
  assert.doesNotMatch(code, /<(?:Text|Html|Billboard|Sprite|img)\b/);
});

test('complete landmark footprints remain in the 15–40 unit outer ring and outside worker rooms', () => {
  const placements = [...source().matchAll(/kind: '([^']+)', position: \[(-?\d+), 0, (-?\d+)\], radius: ([\d.]+)/g)];
  assert.equal(placements.length, 8);
  for (const [, kind, xString, zString, radiusString] of placements) {
    const x = Number(xString), z = Number(zString), radius = Number(radiusString);
    const distance = Math.hypot(x, z);
    assert.ok(distance - radius >= 15, `${kind} intrudes into inner ring`);
    assert.ok(distance + radius <= 40, `${kind} exceeds outer ring`);
    assert.ok(Math.abs(x) - radius > 12 || Math.abs(z) - radius > 8, `${kind} intersects rooms`);
  }
});

test('aqueduct arch is a thick solid with a genuinely empty intrados', () => {
  const code = source();
  const start = code.indexOf('const archShape = new Shape();');
  const end = code.indexOf('arch.translate(0, 0, -0.425);') + 'arch.translate(0, 0, -0.425);'.length;
  assert.ok(start >= 0 && end > start);
  // Exercise the actual geometry constructor source without a DOM/WebGL renderer.
  const geometry = new Function('Shape', 'ExtrudeGeometry', `${code.slice(start, end)}; return arch;`)(Shape, ExtrudeGeometry) as ExtrudeGeometry;
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.updateMatrixWorld();
  const opening = new Raycaster(new Vector3(0, 0.5, 4), new Vector3(0, 0, -1));
  const masonry = new Raycaster(new Vector3(0, 1.2, 4), new Vector3(0, 0, -1));
  assert.equal(opening.intersectObject(mesh).length, 0);
  assert.ok(masonry.intersectObject(mesh).length > 0);
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox!.max.z - geometry.boundingBox!.min.z > 0.8);
  geometry.dispose();
  (mesh.material as MeshBasicMaterial).dispose();
});
