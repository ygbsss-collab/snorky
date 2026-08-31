const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNuemh1d3V5YmF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNjAxMSwiZXhwIjoyMDg3MjgyMDExfQ.12t223e74M9zL9Nf6D8l7p4m2J1k1K5z1q1W2e3R4t5";

const headers = {
  "apikey": serviceRoleKey,
  "Authorization": `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json"
};

async function main() {
  const res = await fetch(`${supabaseUrl}/point_evaluation_results?point_id=eq.22&mode=eq.TODAY_HOURLY&select=*`, {
    headers
  });
  console.log("Status:", res.status, res.statusText);
  const text = await res.text();
  console.log("Body:", text.slice(0, 300));
}

main().catch(console.error);
