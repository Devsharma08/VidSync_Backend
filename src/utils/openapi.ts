import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

// schema definition and registration
export const registry = new OpenAPIRegistry(); // acts as in-mem db storage where all schema definitions are stored

// gives this data structure a name and this will appear as a reusable schema model component in the docx's sidebar
export const AnalyzeRequestSchema = registry.register(
  'AnalyzeRequest',
  z.object({
    url: z.string().url().openapi({ example: 'https://www.youtube.com/watch?v=afLeOefHKG4' }),
    channelLink: z.string().url().optional().openapi({ example: 'https://www.youtube.com/@kidshut' })
  })
);

export const BasicVideoRequestSchema = registry.register('BasicVideoRequest',z.object({
   url:z.string().url().openapi({ example: 'https://www.youtube.com/watch?v=afLeOefHKG4' })
})) 

export const QueryRequestSchema = registry.register('QueryRequest', z.object({
   question: z.string().openapi({ example: 'How can I analyze this stream?' }),
   url: z.string().url().openapi({ example: 'https://www.youtube.com/watch?v=afLeOefHKG4' }),
   timelineBlocks: z.array(z.any()).optional().openapi({ description: 'Optional pre-computed timeline blocks with embeddings' })
}))


export const ArchiveRequestSchema = registry.register('ArchiveRequest', z.object({
    url: z.string().url().openapi({ example: 'https://www.youtube.com/watch?v=afLeOefHKG4' }),
    channelLink: z.string().url().optional().openapi({ example: 'https://www.youtube.com/@kidshut' }),
    onlyStreamerChat: z.boolean().optional().openapi({ example: true })
  })
)

// Register Endpoints - this will links the end point /api/video/analyze to our schema metadata

// analyze
registry.registerPath({
  method: 'post',
  path: '/api/video/analyze',
  summary: 'Analyze YouTube Stream',
  description: 'Scrapes transcript, logs, shifts typing latency, generates embeddings, and starts analysis.',
  request: {
    body: {
      content: {
        'application/json': { schema: AnalyzeRequestSchema }
      }
    }
  },
  responses: {
    200: {
      description: 'SSE Connection started successfully'
    }
  }
});

// detail
registry.registerPath({
   method:'post',
   path:'/api/video/detail',
   summary:'get video details',
   description:'get video details',
   request:{
    body:{
       content:{
         'application/json':{ schema: BasicVideoRequestSchema }
       }
    }
   },
   responses:{
     200:{
      description:'video details'
     }
   }
})

// summarize 
registry.registerPath({
   method:'post',
   path: '/api/ai/summarize',
   summary:'Generate Analytical video Summary',
   description:'Generate Analytical video Summary',
   request:{
    body:{
      content:{
        'application/json':{ schema: BasicVideoRequestSchema }
      }
    }
   },
   responses:{
     200:{
      description:'video summary'
     }
   }
})

// query
registry.registerPath({
   method:'post',
   path: '/api/ai/query',
   summary: 'Query the video',
   description: 'Query the video',
   request: {
    body: {
      content: {
        'application/json': { schema: QueryRequestSchema }
      }
    }
   },
   responses:{
     200:{
      description:'video query'
     }
   }
})

// transcript
registry.registerPath({
   method:'post',
   path:'/api/transcript',
   summary:'Get video transcript',
   description:'Get video transcript',
   request:{
    body:{
      content:{
        'application/json':{ schema: BasicVideoRequestSchema }
      }
    }
   },
   responses:{
     200:{
      description:'video transcript'
     }
   }
})

// process outcome
registry.registerPath({
   method:'post',
   path: '/api/process-outcomes',
   summary:'Compile chapters and suggested tags',
   description:'Parse transcript to extract auto-chapters,keywords,and analytics overview',
   request:{
      body:{
         content:{
            'application/json':{
               schema:BasicVideoRequestSchema
            }
         }
      }
   },
   responses:{
     200:{
      description:'success'
     }
   }
})

registry.registerPath({
  method: 'post',
  path: '/api/archive/chat-or-comments',
  summary: 'Fetch Stream Chat logs',
  description: 'Pulls finished stream chat replays via python chat-downloader, active live chat, or standard comments fallback.',
  request: {
    body: {
      content: { 'application/json': { schema: ArchiveRequestSchema } }
    }
  },
  responses: {
    200: { description: 'Chat messages payload returned' }
  }
});


// ==========================================
// Document Generator Function
// ==========================================

// Generate the OpenAPI spec JSON document -- openApiGeneratorV3 reads all schemas and routes stored in the registry

export function getOpenAPIDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions); // initialize the generator by passing the registry's definitions
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Post-Stream Ingestion & Analysis Engine API',
      version: '1.0.0',
      description: 'Local semantic vector RAG search & stream parsing documentation'
    }
  });
}
