import { Router,Request,Response } from "express";
import { extractVideoId } from "../utils/youtube-parser";
import { YoutubeService } from "../services/google.service";

const route = Router();

const videoServie = new YoutubeService();

// post http://localhost:5000/api/video/detail
// body json : {url : "https://www.youtube.com/..."}
route.post('/detail', async (req: Request, res: Response):Promise<void> => {
   try {
      const url = req.body.url;
      if (!url) {
         res.status(400).json({ message: "URL is required" });
         return;
      }

      const videoId = extractVideoId(url);
      if(!videoId){
         res.status(400).json({message : "Invalid URL"});
         return;
      }

      // call the api service using extracted youtube video id
      const video = await videoServie.getVideoById(videoId);
      res.json({video});
      
   } catch (error) {
      console.error(error);
      res.status(500).json({message : "Internal server error"});
   }
})

export default route;