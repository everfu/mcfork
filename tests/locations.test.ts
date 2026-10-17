import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityNames, loadDistricts } from '../shared/locations.ts';

test('every listed city loads its own nonempty, unique area choices', async () => {
  assert.equal(new Set(cityNames).size, cityNames.length);
  for (const city of cityNames) {
    const areas = await loadDistricts(city);
    assert.ok(areas.length >= 4, city);
    assert.equal(new Set(areas).size, areas.length, city);
    assert.ok(areas.every(area => area.length > 0 && area.length <= 80), city);
  }
  assert.ok((await loadDistricts('杭州')).includes('武林广场'));
  assert.ok(!(await loadDistricts('北京')).includes('武林广场'));
  assert.deepEqual(await loadDistricts('未收录的城市'), []);
});
