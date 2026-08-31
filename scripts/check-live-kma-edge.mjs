const SUPABASE_URL = "https://vqpkckonpsnzhuwuybav.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNnemh1d3V5YmF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NjgwNDgsImV4cCI6MjA3MTE0NDA0OH0.eD26Wp8K3i6cZkL2sYw8eSZe9J5W3fN_6K4wYgB7V2Y";

async function main() {
  console.log("=== kma-warnings Edge Function 실호출 ===");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/kma-warnings`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Status text:", data.status);
  console.log("parsedRowCount:", data.parsedRowCount);
  console.log("normalizedWarningCount:", data.normalizedWarningCount);
  console.log("Active Warnings List:");
  (data.normalizedWarnings || []).forEach(w => {
    console.log(` - code: ${w.code} | name: ${w.name} | warning: ${w.warning_type_name} ${w.warning_level_name} | status: ${w.status_name}`);
  });
}

main().catch(console.error);
