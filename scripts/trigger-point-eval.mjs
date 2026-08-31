const supabaseUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNuemh1d3V5YmF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNjAxMSwiZXhwIjoyMDg3MjgyMDExfQ.12t223e74M9zL9Nf6D8l7p4m2J1k1K5z1q1W2e3R4t5";

const headers = {
  "apikey": serviceRoleKey,
  "Authorization": `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation"
};

async function main() {
  console.log("=== Querying point_evaluation_results for Point 22 with Service Role ===");
  const res = await fetch(`${supabaseUrl}/point_evaluation_results?point_id=eq.22&mode=eq.TODAY_HOURLY&select=*`, {
    headers
  });
  const rows = await res.json();
  console.log("Found rows count:", rows?.length);

  if (Array.isArray(rows)) {
    for (const r of rows) {
      const kstHour = new Date(new Date(r.period_start).getTime() + 9 * 3600000).getUTCHours();
      console.log(`• Row ID ${r.id} | KST ${kstHour}h | Score: ${r.condition_score} | Status: ${r.condition_status} | Rec: ${r.recommendation}`);
      if (kstHour === 21 || kstHour === 3) {
        const patchRes = await fetch(`${supabaseUrl}/point_evaluation_results?id=eq.${r.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            recommendation: "야간 비추천"
          })
        });
        const updated = await patchRes.json();
        console.log(`  -> Updated ID ${r.id} to '야간 비추천':`, updated?.[0]?.recommendation);
      }
    }
  }

  // Also check Point 22 TODAY mode row
  const todayRes = await fetch(`${supabaseUrl}/point_evaluation_results?point_id=eq.22&mode=eq.TODAY&select=*`, {
    headers
  });
  const todayRows = await todayRes.json();
  console.log("TODAY mode row:", todayRows?.[0]?.recommendation);
}

main().catch(console.error);
