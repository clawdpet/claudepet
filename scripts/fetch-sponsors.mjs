// Fetches the public sponsors of the authenticated GitHub account and writes
// them to a JSON file that the ClaudePet website can read.
//
// Usage:
//   SPONSORS_TOKEN=<classic personal access token, scope read:user> \
//     node scripts/fetch-sponsors.mjs <output.json>
//
// Only PUBLIC sponsorships are kept, and amounts are never exported: the output
// carries the tier name only. If anything fails, the output file is left untouched.
//
// Sponsors that are organizations are skipped on purpose: reading their fields needs
// the broader `read:org` scope, and the token is kept to `read:user` only.

import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API_URL = 'https://api.github.com/graphql';

const QUERY = `
query ($after: String) {
  viewer {
    sponsorshipsAsMaintainer(first: 100, after: $after, activeOnly: true, includePrivate: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        privacyLevel
        tier { name monthlyPriceInCents }
        sponsorEntity {
          __typename
          ... on User { login name avatarUrl url }
        }
      }
    }
  }
}`;

// Highest tier first, then oldest sponsor first.
// Private sponsorships and organization sponsors are dropped.
export const toPublicSponsors = (nodes) =>
  nodes
    .filter(
      (node) =>
        node.privacyLevel === 'PUBLIC' &&
        node.sponsorEntity?.__typename === 'User' &&
        node.sponsorEntity.login,
    )
    .sort(
      (a, b) =>
        (b.tier?.monthlyPriceInCents ?? 0) - (a.tier?.monthlyPriceInCents ?? 0) ||
        (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
    )
    .map(({ sponsorEntity, tier }) => ({
      login: sponsorEntity.login,
      name: sponsorEntity.name || sponsorEntity.login,
      avatarUrl: sponsorEntity.avatarUrl,
      url: sponsorEntity.url,
      tier: tier?.name ?? null,
    }));

const fetchPage = async (token, after) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claudepet-sponsors',
    },
    body: JSON.stringify({ query: QUERY, variables: { after } }),
  });
  if (!response.ok) throw new Error(`GitHub API answered ${response.status}`);

  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(`GitHub API error: ${body.errors.map((error) => error.message).join('; ')}`);
  }
  return body.data.viewer.sponsorshipsAsMaintainer;
};

export const fetchAllSponsorships = async (token) => {
  const nodes = [];
  let after = null;
  do {
    const page = await fetchPage(token, after);
    nodes.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return nodes;
};

const main = async () => {
  const [outputPath] = process.argv.slice(2);
  const token = process.env.SPONSORS_TOKEN;
  if (!outputPath) throw new Error('Usage: node scripts/fetch-sponsors.mjs <output.json>');
  if (!token) throw new Error('SPONSORS_TOKEN is not set');

  const sponsors = toPublicSponsors(await fetchAllSponsorships(token));
  await writeFile(outputPath, `${JSON.stringify(sponsors, null, 2)}\n`);
  console.log(`Wrote ${sponsors.length} public sponsor(s) to ${outputPath}`);
};

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
