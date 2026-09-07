async function main() {
    const key = "506df4dccea45a84b8374c6e41850e9b166ea2782bc8d000f1d9577e1f08828b"; // The secret from Supabase
    
    // Test apihub.kma.go.kr warning endpoint
    const urlWarnings = `https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php?fe=f&tm=202609071000&disp=0&help=1&authKey=${key}`;
    try {
        const resWarnings = await fetch(urlWarnings);
        const text = await resWarnings.text();
        console.log(`Warnings Endpoint (apihub): ${resWarnings.status}`);
        if(text.includes('AUTH_FAIL') || text.includes('ERR')) {
            console.log("Response text contains error:", text.substring(0, 50));
        } else {
            console.log("Response ok");
        }
    } catch (e) {
        console.error(e);
    }
}
main().catch(console.error);
