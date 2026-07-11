import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({
  path: '.env'
});

import cors from 'cors';
import { setGlobalDispatcher, Agent } from 'undici';
import videoRouter from './routes/video.routes';
import archiveRouter from './routes/archive.routes';
import transcriptRouter from './routes/transcript.routes';
import aiRouter from './routes/ai.routes';
import { videoWorker } from './queue/video.worker';
import { videoQueue } from './queue/video.queue';
import { apiReference } from '@scalar/express-api-reference';
import { getOpenAPIDocument } from './utils/openapi';

// Set up the global fetch dispatcher configuration with increased timeout parameters.
// This prevents HeadersTimeoutError (UND_ERR_HEADERS_TIMEOUT) when waiting for the local
// Ollama large language model to complete long inference or vector embedding tasks.
setGlobalDispatcher(new Agent({
  connectTimeout: 60000,
  headersTimeout: 300000,
  bodyTimeout: 300000,
}));

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Enable parsing of JSON body payloads
app.use(express.json());

// Serve the Scalar interactive OpenAPI documentation reference
app.use('/reference', apiReference({
  spec: {
    content: getOpenAPIDocument(),
  }
}));

// Configure Cross-Origin Resource Sharing (CORS) for local frontend requests
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Mount API endpoint routers
app.use('/api/video', videoRouter);
app.use('/api/archive', archiveRouter);
app.use('/api', transcriptRouter);
app.use('/api/ai', aiRouter);

/**
 * Health check endpoint to verify server status.
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Start the Express HTTP listener
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server successfully running on http://localhost:${PORT}`);
});

/**
 * Handle graceful shutdown of the HTTP server, BullMQ worker, and queue connections.
 */
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('HTTP server closed.');
  });

  try {
    console.log('Closing BullMQ worker...');
    await videoWorker.close();
    console.log('BullMQ worker closed.');

    console.log('Closing BullMQ queue...');
    await videoQueue.close();
    console.log('BullMQ queue closed.');
  } catch (error) {
    console.error('Error during BullMQ graceful shutdown:', error);
  }

  console.log('Graceful shutdown completed. Exiting process.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

