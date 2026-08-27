async function testSinglePointOrch() {
  const functionUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/point-evaluation-refresh";
  const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";
  const headers = {
    "apikey": publishableKey,
    "Authorization": `Bearer ${publishableKey}`,
    "Content-Type": "application/json"
  };

  const res = await fetch(functionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ point_id: 4, source: "single-debug" })
  });

  const data = await res.json();
  console.log("Single Point 4 Refresh Result:", JSON.stringify(data, null, 2));
}

testSinglePointOrch();
