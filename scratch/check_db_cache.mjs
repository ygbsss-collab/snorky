import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabase = createClient(
    'https://vqpkckonpsnzhuwuybav.supabase.co',
    'e28922dc4c70064b5aee47b06b632c53ae054f0cccd716576ff4dcce96258ac7', // Service role key
    { auth: { persistSession: false } }
  );

  console.log('--- Checking kma_safety_cache ---');
  const cache = await supabase.from('kma_safety_cache').select('*').order('fetched_at', { ascending: false }).limit(1).maybeSingle();
  if (cache.data) {
    console.log(`HTTP Status: ${cache.data.http_status}`);
    console.log(`Status: ${cache.data.status}`);
    console.log(`Warnings count: ${cache.data.normalized_warnings ? cache.data.normalized_warnings.length : 0}`);
    console.log(`Warning index exists: ${!!cache.data.warning_index}`);
    console.log(`Fetched at: ${cache.data.fetched_at}`);
  } else {
    console.log('No cache data found or error:', cache.error);
  }

  console.log('\n--- Checking kma_api_request_log ---');
  const log = await supabase.from('kma_api_request_log')
    .select('*')
    .eq('api_name', 'warnings')
    .order('request_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (log.data) {
    console.log(`Latest log HTTP Status: ${log.data.http_status}`);
    console.log(`Outcome: ${log.data.outcome}`);
    console.log(`Timestamp: ${log.data.request_timestamp}`);
  } else {
    console.log('No log data found or error:', log.error);
  }
}

main().catch(console.error);
