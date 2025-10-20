import express from 'express';
import cors from 'cors';
import path from 'path';
import config from './config';
import logger from './utils/logger';
import { ImapSyncService } from './services/imap.service';
import { ElasticsearchService } from './services/elasticsearch.service';
import { AICategoryService } from './services/ai-category.service';
import { WebhookService } from './services/webhook.service';
import { RagService } from './services/rag.service';
import { EmailController } from './controllers/email.controller';
import { createEmailRouter } from './routes/email.routes';
import { createAccountRouter } from './routes/account.routes';
import { EmailDocument } from './models/email';

async function bootstrap() {
  try {
    logger.info('Starting ReachInbox Onebox Email Aggregator...');
    
    // Initialize services
    const elasticsearchService = new ElasticsearchService(config.elasticsearch.host);
    await elasticsearchService.init();
    
    const aiCategoryService = new AICategoryService(config.gemini.apiKey);
    
    const webhookService = new WebhookService(
      config.webhooks.slack,
      config.webhooks.external
    );
    
    const ragService = new RagService(config.gemini.apiKey, config.qdrant.host);
    await ragService.init();
    
    // Initialize example product data for RAG
    await initializeProductData(ragService);
    
    // Initialize IMAP sync service
    const imapSyncService = new ImapSyncService(config.imapAccounts);
    
    // Set up event handlers for new emails
    imapSyncService.on('emailReceived', async (email: EmailDocument) => {
      try {
        // 1. Index the email in Elasticsearch
        await elasticsearchService.indexEmail(email);
        logger.info(`Indexed email: ${email.subject}`);
        
        // 2. Categorize the email using AI
        const category = await aiCategoryService.categorizeEmail(email);
        await elasticsearchService.updateCategory(email.id, category);
        logger.info(`Categorized email ${email.id} as ${category}`);
        
        // 3. Send notifications if the email is categorized as 'Interested'
        if (category === 'Interested') {
          email.aiCategory = category;
          await webhookService.notifyInterestedEmail(email);
        }
      } catch (error) {
        logger.error(`Error processing received email ${email.id}:`, error);
      }
    });
    
    // Start the IMAP sync
    await imapSyncService.startSync();
    
    // Set up Express server
    const app = express();
    app.use(cors());
    app.use(express.json());
    
    // Serve static files from 'public' directory
    app.use(express.static(path.join(__dirname, 'public')));
    
    // Set up controllers
    const emailController = new EmailController(elasticsearchService, ragService);
    
    // Set up API routes
    app.use('/api/emails', createEmailRouter(emailController));
    app.use('/api/accounts', createAccountRouter(emailController));
    
    // Serve the frontend for any other routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
    
    // Start the server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      server.close();
      await imapSyncService.stopSync();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Shutting down...');
      server.close();
      await imapSyncService.stopSync();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

/**
 * Initialize example product data for RAG
 */
async function initializeProductData(ragService: RagService): Promise<void> {
  const productDataChunks = [
    "Our product, ReachInbox, is an AI-driven platform that helps businesses find and engage high-intent leads. We offer multi-channel outreach on Twitter, LinkedIn, email, and phone.",
    "For scheduling meetings with interested leads, please use our calendar link: https://cal.com/reachinbox/demo",
    "Our pricing plans start at $99/month for the Basic plan, $199/month for the Pro plan, and $499/month for the Enterprise plan. All plans include unlimited leads and multi-channel outreach.",
    "If a lead mentions they're interested in a demo, always share the meeting booking link: https://cal.com/reachinbox/demo and offer a 14-day free trial.",
    "For technical support issues, please direct the customer to our knowledge base at https://support.reachinbox.com or our support email at support@reachinbox.com.",
    "Our platform features include: AI-driven lead generation, email verification, multi-channel outreach, personalized sequences, and response notifications.",
    "When someone is applying for a job position, if they are shortlisted, share the technical interview booking link: https://cal.com/reachinbox/interview.",
    "If a lead is not interested, thank them for their time and let them know they can reach out in the future if their needs change."
  ];
  
  try {
    await ragService.storeProductData(productDataChunks);
    logger.info('Initialized product data for RAG');
  } catch (error) {
    logger.error('Failed to initialize product data:', error);
  }
}

// Start the application
bootstrap();