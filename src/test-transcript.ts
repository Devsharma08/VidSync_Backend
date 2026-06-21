import { YoutubeTranscript } from "youtube-transcript";

async function test() {
   try {
      console.log("Fetching transcript for afLeOefHKG4...");
      const t = await YoutubeTranscript.fetchTranscript("afLeOefHKG4");
      console.log("Success! Total segments:", t.length);
      console.log("Sample segment:", t[0]);
   } catch (e: any) {
      console.error("Error:", e.message);
   }
}
test();
