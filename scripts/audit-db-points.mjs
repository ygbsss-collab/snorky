import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://vqpkckonpsnzhuwuybav.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxcGtja29ucHNnemh1d3V5YmF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSI6ImFub24iLCJpYXQiOjE3NTU1NjgwNDgsImV4cCI6MjA3MTE0NDA0OH0.eD26Wp8K3i6cZkL2sYw8eSZe9J5W3fN_6K4wYgB7V2Y";

// We can query directly with supabase-js or via psql/db query
async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: regions, error: rErr } = await sb.from('regions').select('*').order('id');
  const { data: points, error: pErr } = await sb.from('points').select('id, name, region_id, lat, lng, warning_area_code').order('id');

  if (rErr || pErr) {
    console.error("Fetch Error:", rErr || pErr);
    return;
  }

  console.log(`=== DB Regions 현황 (${regions.length}개) ===`);
  regions.forEach(r => {
    console.log(`[Region ${r.id}] ${r.name}: warning_area_code = ${r.warning_area_code}`);
  });

  console.log(`\n=== DB Points 현황 (${points.length}개) ===`);
  const pointsByRegion = {};
  points.forEach(p => {
    if (!pointsByRegion[p.region_id]) pointsByRegion[p.region_id] = [];
    pointsByRegion[p.region_id].push(p);
  });

  for (const r of regions) {
    const pts = pointsByRegion[r.id] || [];
    console.log(`\n[지역: ${r.name} (ID: ${r.id})] 총 ${pts.length}개 포인트:`);
    pts.forEach(p => {
      console.log(`  - [ID: ${p.id}] ${p.name} (위도: ${p.lat}, 경도: ${p.lng}) -> warning_area_code: ${p.warning_area_code}`);
    });
  }
}

main().catch(console.error);
