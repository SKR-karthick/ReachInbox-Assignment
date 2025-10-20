import { EmailDocument } from '../models/email';
import logger from '../utils/logger';
import fetch from 'node-fetch';

interface EmbeddingResponse {
  embedding: {
    values: number[];
  };
}

interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
}

export class RagService {
  private geminiApiKey: string;
  private qdrantHost: string;
  private collectionName = 'product_data';
  private collectionInitialized = false;
  
  constructor(geminiApiKey: string, qdrantHost: string) {
    this.geminiApiKey = geminiApiKey;
    this.qdrantHost = qdrantHost;
  }
  
  /**
   * Initialize the vector database collection
   */
  public async init(): Promise<void> {
    try {
      // Check if collection exists
      const response = await fetch(`${this.qdrantHost}/collections/${this.collectionName}`);
      
      if (response.status === 404) {
        // Create the collection
        await this.createCollection();
      } else if (response.ok) {
        logger.info(`Qdrant collection ${this.collectionName} already exists`);
        this.collectionInitialized = true;
      } else {
        const errorText = await response.text();
        logger.error(`Qdrant API error (${response.status}): ${errorText}`);
        throw new Error(`Failed to initialize Qdrant collection: ${errorText}`);
      }
    } catch (error) {
      logger.error('Error initializing Qdrant collection:', error);
      throw error;
    }
  }
  
  /**
   * Create the vector database collection
   */
  private async createCollection(): Promise<void> {
    try {
      const response = await fetch(`${this.qdrantHost}/collections/${this.collectionName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vectors: {
            size: 768, // Embedding dimension size
            distance: 'Cosine'
          }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to create Qdrant collection: ${errorText}`);
        throw new Error(`Failed to create Qdrant collection: ${errorText}`);
      }
      
      logger.info(`Created Qdrant collection: ${this.collectionName}`);
      this.collectionInitialized = true;
    } catch (error) {
      logger.error('Error creating Qdrant collection:', error);
      throw error;
    }
  }
  
  /**
   * Store product data in the vector database
   */
  public async storeProductData(chunks: string[]): Promise<void> {
    if (!this.collectionInitialized) {
      await this.init();
    }
    
    try {
      // Process chunks in batches to avoid overwhelming the API
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        batches.push(chunks.slice(i, i + batchSize));
      }
      
      let pointId = 1;
      
      // Process each batch sequentially
      for (const batch of batches) {
        const points = [];
        
        for (const chunk of batch) {
          // Generate embedding for the chunk
          const embedding = await this.generateEmbedding(chunk);
          
          points.push({
            id: pointId.toString(),
            vector: embedding,
            payload: {
              text: chunk
            }
          });
          
          pointId++;
        }
        
        // Store the batch in Qdrant
        const response = await fetch(`${this.qdrantHost}/collections/${this.collectionName}/points`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            points
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Failed to store vectors in Qdrant: ${errorText}`);
          throw new Error(`Failed to store vectors: ${errorText}`);
        }
      }
      
      logger.info(`Stored ${chunks.length} product data chunks in Qdrant`);
    } catch (error) {
      logger.error('Error storing product data:', error);
      throw error;
    }
  }
  
  /**
   * Generate an embedding for text using the Gemini API
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${this.geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: "embedding-001",
            content: {
              parts: [
                {
                  text: text
                }
              ]
            }
          })
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Gemini embedding API error (${response.status}): ${errorText}`);
        throw new Error(`Failed to generate embedding: ${errorText}`);
      }
      
      const data = await response.json() as EmbeddingResponse;
      return data.embedding.values;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw error;
    }
  }
  
  /**
   * Search for relevant product data
   */
  private async searchVectorDatabase(query: string, limit: number = 3): Promise<VectorSearchResult[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Search Qdrant for similar vectors
      const response = await fetch(`${this.qdrantHost}/collections/${this.collectionName}/points/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vector: queryEmbedding,
          limit: limit,
          with_payload: true
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Qdrant search API error (${response.status}): ${errorText}`);
        throw new Error(`Failed to search vectors: ${errorText}`);
      }
      
      const data = await response.json();
      
      // Format the search results
      return data.result.map((item: any) => ({
        id: item.id,
        text: item.payload.text,
        score: item.score
      }));
    } catch (error) {
      logger.error('Error searching vector database:', error);
      throw error;
    }
  }
  
  /**
   * Generate a suggested reply for an email using RAG
   */
  public async generateSuggestedReply(email: EmailDocument): Promise<string> {
    try {
      // 1. Retrieve relevant context from the vector database
      const relevantContext = await this.searchVectorDatabase(email.body);
      
      // 2. Build the prompt with the retrieved context
      const prompt = this.buildPrompt(email, relevantContext);
      
      // 3. Call the Gemini API to generate the reply
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              topP: 0.8,
              topK: 40,
              maxOutputTokens: 500
            }
          })
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Gemini API error (${response.status}): ${errorText}`);
        throw new Error(`Failed to generate reply: ${errorText}`);
      }
      
      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!generatedText) {
        logger.error('No valid response from Gemini API');
        throw new Error('Failed to generate reply: No response text');
      }
      
      return generatedText.trim();
    } catch (error) {
      logger.error('Error generating suggested reply:', error);
      throw error;
    }
  }
  
  /**
   * Build the prompt for the LLM with retrieved context
   */
  private buildPrompt(email: EmailDocument, relevantContext: VectorSearchResult[]): string {
    // Extract the email content
    const emailContent = `
      From: ${email.from}
      To: ${email.to.join(', ')}
      Subject: ${email.subject}
      
      ${email.body}
    `.trim();
    
    // Combine the retrieved context
    const contextText = relevantContext.map(item => item.text).join('\n\n');
    
    // Build the full prompt
    return `
      You are a helpful assistant that writes professional, relevant email replies. Your task is to draft a reply to the email below.
      
      CONTEXT (Reference this information when drafting your reply):
      ${contextText}
      
      ORIGINAL EMAIL:
      ${emailContent}
      
      INSTRUCTIONS:
      Based ONLY on the context provided and the original email, draft a professional and helpful reply. Be concise and address the specific points in the email. If the email contains questions, answer them using the information from the context. Include any relevant links, meeting information, or product details from the context. Do not include information that isn't supported by the context.
      
      YOUR REPLY:
    `.trim();
  }
}