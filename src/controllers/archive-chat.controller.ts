import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export async function getPastStreamerChat(url:string):Promise<any[]>
{
   return new Promise((resolve,reject)=>{
      let pythonPath = 'python';
      const venvWin = path.join(process.cwd(), '..', '.venv', 'Scripts', 'python.exe');
      const venvUnix = path.join(process.cwd(), '..', '.venv', 'bin', 'python');

      if (fs.existsSync(venvWin)) {
         pythonPath = venvWin;
      } else if (fs.existsSync(venvUnix)) {
         pythonPath = venvUnix;
      }

      const pythonProcess = spawn(pythonPath,[
         'src/utils/fetch_archive_chat.py',
         url
      ])

      const timeoutId = setTimeout(() => {
         console.warn(`⚠️ Python chat-downloader timed out after 10 seconds. Terminating process.`);
         pythonProcess.kill();
         reject(new Error('Python execution timed out'));
      }, 10000);

      let resultData = '';
      pythonProcess.stdout.on('data',(data)=>{
         resultData += data.toString();
      })

      pythonProcess.stderr.on('data',(code)=>{
         console.error('python execution error:',code.toString());
      })

      pythonProcess.on('close',(code)=>{
         clearTimeout(timeoutId);
         if(code!==0){
            reject(new Error(`python script exited with code ${code}`));
            return;
         }
         try {
            const comments = JSON.parse(resultData);
            resolve(comments);
         } catch (parseError) {
            console.error('Error parsing JSON:',parseError);
            reject(new Error('Failed to parse comments'));
         }
      })
   })
}