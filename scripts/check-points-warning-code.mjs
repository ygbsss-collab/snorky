const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
const headers = {
  apikey: publishableKey,
  Authorization: `Bearer ${publishableKey}`
};

async function main() {
  const pRes = await fetch(`${restUrl}/rest/v1/points?id=eq.22&select=id,name,region_id,lat,lng,warning_area_code`, { headers });
  const points = await pRes.json();
  console.log("Points table row for ID 22:", points);

  // Check sample points
  const allRes = await fetch(`${restUrl}/rest/v1/points?limit=10&select=id,name,warning_area_code`, { headers });
  const allPoints = await allRes.json();
  console.log("Sample points warning_area_code:", allPoints);

  // Check edge function kma-warnings response
  const res = await fetch(`${restUrl}/functions/v1/kma-warnings`, { headers });
  console.log("GET /functions/v1/kma-warnings status:", res.status);
  const json = await res.json();
  console.log("GET /functions/v1/kma-warnings body:", JSON.stringify(json, null, 2));
}

main().catch(console.error);
