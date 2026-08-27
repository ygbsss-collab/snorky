const restUrl = "https://vqpkckonpsnzhuwuybav.supabase.co/rest/v1";
const publishableKey = "sb_publishable_G5dyFNcFGGsNsrJ2w3rKFg_aeNhWDvT";

async function main() {
  const res = await fetch(`${restUrl}/points?select=id,name,region_id,warning_area_code,latitude,longitude&limit=50`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }
  });
  const points = await res.json();
  console.log("=== DB 포인트 목록 및 warning_area_code ===");
  points.forEach(p => {
    console.log(`id: ${p.id} | name: ${p.name} | warningAreaCode: ${p.warning_area_code}`);
  });

  const jeju = points.filter(p => p.warning_area_code?.startsWith("S132"));
  console.log("\n제주도 및 남해 특보권역 포인트:", jeju);
}

main().catch(console.error);
