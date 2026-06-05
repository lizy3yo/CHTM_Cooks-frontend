/**
 * Clear all app:* cache keys from Upstash Redis
 * Usage: node scratch/clear-cache.mjs
 */

const UPSTASH_URL = 'https://inviting-crappie-37624.upstash.io';
const UPSTASH_TOKEN = 'AZL4AAIncDEzNmZkMTM0Y2I1MDM0ZDgyYTEzMWUwNTM2M2MwYmZiYnAxMzc2MjQ';

async function upstash(command, ...args) {
  const res = await fetch(`${UPSTASH_URL}/${[command, ...args].map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

async function main() {
  console.log('🔍 Scanning Upstash for app:* keys...');

  let cursor = '0';
  let allKeys = [];
  let scanCount = 0;

  do {
    const result = await upstash('SCAN', cursor, 'MATCH', 'app:*', 'COUNT', '100');
    cursor = result[0];
    const keys = result[1];
    allKeys = allKeys.concat(keys);
    scanCount++;
    process.stdout.write(`\r   Scanned batch ${scanCount}, found ${allKeys.length} keys so far...`);
  } while (cursor !== '0');

  console.log(`\n✅ Total keys found: ${allKeys.length}`);

  if (allKeys.length === 0) {
    console.log('✨ Cache is already empty!');
    return;
  }

  console.log('🗑️  Deleting keys...');
  let deleted = 0;

  // Delete in batches of 50 (Upstash REST API per-request limit)
  const BATCH = 50;
  for (let i = 0; i < allKeys.length; i += BATCH) {
    const batch = allKeys.slice(i, i + BATCH);
    // DEL supports multiple keys: /DEL/key1/key2/...
    const count = await upstash('DEL', ...batch);
    deleted += count;
    process.stdout.write(`\r   Deleted ${deleted} / ${allKeys.length} keys...`);
  }

  console.log(`\n🎉 Done! Cleared ${deleted} cache keys from Redis.`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
