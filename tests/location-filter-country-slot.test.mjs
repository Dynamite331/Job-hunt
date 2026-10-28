import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLocationFilter } from '../scan.mjs';

const filter = buildLocationFilter({
  always_allow: ['united states'],
  block: ['india', 'bengaluru', 'canada', 'toronto', 'germany', 'berlin'],
});

test('a trailing ISO country code is not read as a US state', () => {
  for (const location of [
    'Bengaluru, Karnataka, IN',
    'Bengaluru, KA, IN',
    'Toronto, ON, CA',
    'Berlin, BE, DE',
  ]) {
    assert.equal(filter(location), false, `${location} stays blocked`);
  }
});

test('each place in a joined location gets its own country-code check', () => {
  for (const location of [
    'Bengaluru, Karnataka, IN; Remote',
    'Toronto, ON, CA · Vancouver, BC, CA',
    'Berlin, BE, DE; Bengaluru, KA, IN',
  ]) {
    assert.equal(filter(location), false, `${location} stays blocked`);
  }
  assert.equal(filter('Toronto, ON, CA · Austin, TX, US'), true, 'a US place in the list still passes');
  assert.equal(filter('Toronto, Canada; Austin TX, US'), true, 'a state before the country slot still passes');
  assert.equal(filter('Austin TX, US'), true);
  assert.equal(filter('Dublin, OH'), true, 'City, ST is not a country slot');
});

test('US states still rescue City, ST and City, ST, Country forms', () => {
  for (const location of ['Dublin, OH', 'Austin, TX, US', 'Columbus, OH, USA', 'Portland, OR, United States']) {
    assert.equal(filter(location), true, `${location} passes`);
  }
  const usBlock = buildLocationFilter({ always_allow: ['united states'], block: ['dublin'] });
  assert.equal(usBlock('Dublin, OH, US'), true);
  assert.equal(usBlock('Dublin, D, IE'), false);
});
