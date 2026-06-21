import { YoutubeTranscript } from "youtube-transcript";
import { ProxyAgent } from "undici";

const proxies = [
   "http://jhhohfzl:vbuulyy2uree@31.56.127.193:7684",
   "http://jhhohfzl:vbuulyy2uree@45.38.107.97:6014",
   "http://jhhohfzl:vbuulyy2uree@38.154.203.95:5863",
   "http://jhhohfzl:vbuulyy2uree@198.105.121.200:6462",
   "http://jhhohfzl:vbuulyy2uree@64.137.96.74:6641",
   "http://jhhohfzl:vbuulyy2uree@198.23.243.226:6361",
   "http://jhhohfzl:vbuulyy2uree@38.154.185.97:6370",
   "http://jhhohfzl:vbuulyy2uree@142.111.67.146:5611",
   "http://jhhohfzl:vbuulyy2uree@191.96.254.138:6185"
];

async function runTests() {
   const videoId = "afLeOefHKG4";
   console.log(`Starting proxy tests for video: ${videoId}\n`);

   for (let i = 0; i < proxies.length; i++) {
      const proxyUrl = proxies[i];
      const parsedUrl = new URL(proxyUrl);
      console.log(`--- [Proxy ${i + 1}/${proxies.length}] Testing IP: ${parsedUrl.hostname}:${parsedUrl.port} ---`);
      
      const proxyAgent = new ProxyAgent(proxyUrl);
      try {
         const res = await YoutubeTranscript.fetchTranscript(videoId, {
            fetch: async (url: any, init: any) => {
               const headers = {
                  ...(init?.headers || {}),
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
               };
               const response = await fetch(url, {
                  ...init,
                  headers,
                  dispatcher: proxyAgent
               } as any);
               return response;
            }
         });
         console.log(`✅ SUCCESS! Found ${res.length} segments with proxy ${parsedUrl.hostname}\n`);
         console.log(`Add this to your EC2 .env:`);
         console.log(`PROXY_URL=${proxyUrl}\n`);
         // Stop on first working proxy
         break;
      } catch (e: any) {
         console.error(`❌ FAILED: ${e.message}\n`);
      }
   }
   console.log("Tests completed.");
}

runTests();
