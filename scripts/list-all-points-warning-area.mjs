const SUPABASE_URL = "https://vqpkckonpsnzhuwuybav.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNnemh1d3V5YmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NjgwNDgsImV4cCI6MjA3MTE0NDA0OH0.eD26Wp8K3i6cZkL2sYw8eSZe9J5W3fN_6K4wYgB7V2Y";

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/points?select=id,name,region,warning_area_code`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  const points = await res.json();
  console.log(`총 DB 포인트 수: ${points.length}`);
  
  const map = {};
  for (const p of points) {
    const code = p.warning_area_code || 'NULL';
    map[code] = (map[code] || 0) + 1;
  }
  console.log("warning_area_code 별 포인트 수:", JSON.stringify(map, null, 2));

  // Check which points have warningAreaCode in S131..., S132..., S123...
  const warningMatchingPoints = points.filter(p => {
    const c = p.warning_area_code;
    return c && (c.startsWith('S131') || c.startsWith('S132') || c.startsWith('S123'));
  });
  console.log("현재 특보 발효 구역(제주/남해/서해남부)에 속한 등록 포인트:", warningMatchingPoints);
}

main();
