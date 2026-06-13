import {spawn} from 'child_process';

export async function getPastStreamerChat(url:string):Promise<any[]>
{
   return new Promise((resolve,reject)=>{
      const pythonProcess = spawn('python',[
         'src/utils/fetch_archive_chat.py',
         url
      ])

      let resultData = '';
      pythonProcess.stdout.on('data',(data)=>{
         resultData += data.toString();
      })

      pythonProcess.stderr.on('data',(code)=>{
         console.error('python execution error:',code.toString());
         // reject(new Error('failed to fetch comments'));
      })

      pythonProcess.on('close',(code)=>{
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