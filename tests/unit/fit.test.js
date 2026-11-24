import assert from 'node:assert/strict';
import { test } from 'node:test';
import { products } from '../../src/catalog.js';
import { recommendSize } from '../../src/fit.js';

const denim = products[0].chest;

test('recommends the smallest garment meeting chest plus preferred ease', () => {
  assert.deepEqual(recommendSize(denim, 94, 'regular'), { size: 'M', ease: 8, target: 102, garmentChest: 102 });
  assert.equal(recommendSize(denim, 94, 'roomy').size, 'L');
  assert.equal(recommendSize(denim, 90, 'close').size, 'S');
});

test('does not recommend a size for invalid or out-of-range measurements', () => {
  assert.equal(recommendSize(denim, NaN, 'regular'), null);
  assert.equal(recommendSize(denim, 122, 'regular').size, null);
  assert.equal(recommendSize(denim, 54, 'roomy').size, null);
});
