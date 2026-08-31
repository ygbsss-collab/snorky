const SUPABASE_URL = "https://vqpkckonpsnzhuwuybav.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNnemh1d3V5YmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NjgwNDgsImV4cCI6MjA3MTE0NDA0OH0.eD26Wp8K3i6cZkL2sYw8eSZe9J5W3fN_6K4wYgB7V2Y";

async function main() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/kma-warnings`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  });
  const data = await res.json();
  console.log(`=== 현재 기상청 발효 중인 특보 전체 (${(data.warnings || []).length}건) ===`);
  (data.warnings || []).forEach((w, idx) => {
    console.log(`[${idx+1}] regId: ${w.regId} (${w.regKo}) | regUp: ${w.regUp} (${w.regUpKo}) | 특보: ${w.warningName} ${w.levelName} | active: ${w.active}`);
  });
  console.log("\nwarningIndex:", data.warningIndex);
}

main().catch(console.error);
