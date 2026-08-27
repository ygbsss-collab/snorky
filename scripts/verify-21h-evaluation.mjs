const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
const headers = {
  "apikey": publishableKey,
  "Authorization": `Bearer ${publishableKey}`,
  "Content-Type": "application/json"
};

async function main() {
  const sunRes = await fetch(`${restUrl}/kasi_sun_times_cache?select=*`, { headers });
  const sunRows = await sunRes.json();
  console.log("KASI SUN ROWS:");
  console.log(JSON.stringify(sunRows, null, 2));

  // Also query 21h slot for TODAY_HOURLY mode specifically
  const hourly21 = await fetch(
    `${restUrl}/point_evaluation_results?point_id=eq.22&mode=eq.TODAY_HOURLY&period_start=like.*12:00:00*&select=*`,
    { headers }
  ).then(r => r.json());
  console.log("21h (12:00:00 UTC) TODAY_HOURLY:", JSON.stringify(hourly21, null, 2));
}

main().catch(console.error);
