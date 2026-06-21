import * as dotenv from "dotenv";

dotenv.config();

const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';

async function run() {
   const videoId = "afLeOefHKG4";
   const youtubeCookie = process.env.YOUTUBE_COOKIE;
   
   // Sanitize any newline characters AND any surrounding quotes (double or single) from the env copy-paste
   const cleanCookie = youtubeCookie 
      ? youtubeCookie.replace(/^["']|["']$/g, "").replace(/[\r\n]+/g, "").trim() 
      : undefined;
   
   console.log("Requesting InnerTube player API with WEB client...");
   try {
      const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          ...(cleanCookie && { 'Cookie': cleanCookie })
      };
      
      console.log("Headers being sent (first 200 chars of Cookie):", {
         ...headers,
         ...(cleanCookie && { 'Cookie': cleanCookie.substring(0, 100) + "..." })
      });

      const resp = await fetch(INNERTUBE_API_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
              context: {
                  client: {
                      clientName: 'WEB',
                      clientVersion: '2.20240308.01.00',
                  }
              },
              videoId: videoId,
          }),
      });

      console.log(`Status: ${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      console.log("Has captions property:", !!data.captions);
      console.log("PlayabilityStatus:", JSON.stringify(data.playabilityStatus));
      
      if (data.captions) {
         const tracks = data.captions.playerCaptionsTracklistRenderer?.captionTracks;
         console.log("Found caption tracks:", !!tracks);
         if (tracks && tracks.length > 0) {
            console.log("First track URL:", tracks[0].baseUrl);
            
            // Try fetching the timedtext URL using the Cookie
            console.log("Fetching timedtext URL...");
            const timedtextResp = await fetch(tracks[0].baseUrl + "&fmt=srv3", {
               headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                  'Referer': 'https://www.youtube.com/',
                  ...(cleanCookie && { 'Cookie': cleanCookie })
               }
            });
            console.log(`Timedtext Status: ${timedtextResp.status} ${timedtextResp.statusText}`);
            const timedtextBody = await timedtextResp.text();
            console.log("Timedtext Body (first 500 chars):", timedtextBody.substring(0, 500));
         }
      } else {
         console.log("Response JSON (first 1000 chars):", JSON.stringify(data).substring(0, 1000));
      }
   } catch (e: any) {
      console.error("Error:", e.message);
   }
}

run();
