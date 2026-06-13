import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  const logFile = path.join(__dirname, 'python-test-log.txt');
  fs.writeFileSync(logFile, 'Testing python execution...\n');

  try {
    const pythonProcess = spawn('python', [
      'src/utils/fetch_archive_chat.py',
      'https://www.youtube.com/watch?v=5qap5aO4i9A'
    ]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      fs.appendFileSync(logFile, `Exit code: ${code}\n`);
      fs.appendFileSync(logFile, `Stdout length: ${stdout.length}\n`);
      fs.appendFileSync(logFile, `Stdout preview: ${stdout.slice(0, 1000)}\n`);
      fs.appendFileSync(logFile, `Stderr: ${stderr}\n`);
      console.log('Done, logs written to:', logFile);
    });
  } catch (err: any) {
    fs.appendFileSync(logFile, `Spawn Error: ${err.message}\n`);
  }
}

runTest();
