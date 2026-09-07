async function main() {
  const edgeUrl = 'https://vqpkckonpsnzhuwuybav.supabase.co/functions/v1/kma-warnings';

  console.log('\n--- GET kma-warnings ---');
  try {
    const getRes = await fetch(edgeUrl);
    const getData = await getRes.json();
    console.log(`HTTP Status: ${getRes.status}`);
    
    // Output specific fields to answer user's questions
    console.log('Status:', getData.status);
    console.log('Upstream Status:', getData.upstreamStatus);
    console.log('Updated At (fetched_at):', getData.updatedAt);
    console.log('Warnings count:', getData.warnings ? getData.warnings.length : 0);
    console.log('Warning Index exists?:', !!getData.warningIndex && Object.keys(getData.warningIndex).length > 0);
    console.log('Diagnostic:', JSON.stringify(getData.diagnostic, null, 2));
  } catch (e) {
    console.error('GET Error:', e);
  }
}

main().catch(console.error);
