import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPublicSponsors } from './fetch-sponsors.mjs';

const node = ({ login, privacyLevel = 'PUBLIC', cents = 100, tier = 'Supporter', createdAt, name = null }) => ({
  createdAt,
  privacyLevel,
  tier: { name: tier, monthlyPriceInCents: cents },
  sponsorEntity: {
    __typename: 'User',
    login,
    name,
    avatarUrl: `https://avatars.githubusercontent.com/${login}`,
    url: `https://github.com/${login}`,
  },
});

test('private sponsors are never exported', () => {
  const result = toPublicSponsors([
    node({ login: 'public-one', createdAt: '2026-01-01T00:00:00Z' }),
    node({ login: 'secret-one', privacyLevel: 'PRIVATE', createdAt: '2026-01-02T00:00:00Z' }),
  ]);
  assert.deepEqual(result.map((sponsor) => sponsor.login), ['public-one']);
});

test('highest tier comes first, then oldest sponsor', () => {
  const result = toPublicSponsors([
    node({ login: 'new-small', createdAt: '2026-03-01T00:00:00Z' }),
    node({ login: 'old-small', createdAt: '2026-01-01T00:00:00Z' }),
    node({ login: 'big', cents: 500, tier: 'Companion', createdAt: '2026-02-01T00:00:00Z' }),
  ]);
  assert.deepEqual(result.map((sponsor) => sponsor.login), ['big', 'old-small', 'new-small']);
});

test('amounts are not exported, only the tier name', () => {
  const [sponsor] = toPublicSponsors([node({ login: 'someone', cents: 500, tier: 'Companion', createdAt: '2026-01-01T00:00:00Z' })]);
  assert.deepEqual(Object.keys(sponsor).sort(), ['avatarUrl', 'login', 'name', 'tier', 'url']);
  assert.equal(sponsor.tier, 'Companion');
});

test('name falls back to the login', () => {
  const [sponsor] = toPublicSponsors([node({ login: 'no-name', createdAt: '2026-01-01T00:00:00Z' })]);
  assert.equal(sponsor.name, 'no-name');
});

test('entries without a sponsor entity are skipped', () => {
  const result = toPublicSponsors([{ createdAt: '2026-01-01T00:00:00Z', privacyLevel: 'PUBLIC', tier: null, sponsorEntity: null }]);
  assert.deepEqual(result, []);
});
