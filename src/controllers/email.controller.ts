import { Request, Response } from 'express';
import { ElasticsearchService } from '../services/elasticsearch.service';
import { RagService } from '../services/rag.service';
import { EmailCategory, SearchParams } from '../models/email';
import logger from '../utils/logger';

export class EmailController {
  constructor(
    private elasticsearchService: ElasticsearchService,
    private ragService: RagService
  ) {}
  
  /**
   * Get all emails with pagination and filters
   */
  public async getEmails(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '20', 10);
      
      // Build search params from query parameters
      const searchParams: SearchParams = {
        page,
        limit,
        query: req.query.query as string,
        accountId: req.query.accountId as string,
        folder: req.query.folder as string
      };
      
      // Optional filters
      if (req.query.category) {
        searchParams.category = req.query.category as EmailCategory;
      }
      
      if (req.query.from) {
        searchParams.from = req.query.from as string;
      }
      
      if (req.query.to) {
        searchParams.to = req.query.to as string;
      }
      
      // Date filters
      if (req.query.dateFrom) {
        searchParams.dateFrom = new Date(req.query.dateFrom as string);
      }
      
      if (req.query.dateTo) {
        searchParams.dateTo = new Date(req.query.dateTo as string);
      }
      
      const result = await this.elasticsearchService.searchEmails(searchParams);
      res.json(result);
    } catch (error) {
      logger.error('Error getting emails:', error);
      res.status(500).json({ error: 'Failed to retrieve emails' });
    }
  }
  
  /**
   * Get a single email by ID
   */
  public async getEmail(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const email = await this.elasticsearchService.getEmail(id);
      
      if (!email) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      
      res.json(email);
    } catch (error) {
      logger.error(`Error getting email ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve email' });
    }
  }
  
  /**
   * Update email properties
   */
  public async updateEmail(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const updates = req.body;
      
      // Validate that email exists
      const email = await this.elasticsearchService.getEmail(id);
      
      if (!email) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      
      // Update the email
      await this.elasticsearchService.updateEmail(id, updates);
      
      // Get the updated email
      const updatedEmail = await this.elasticsearchService.getEmail(id);
      
      res.json(updatedEmail);
    } catch (error) {
      logger.error(`Error updating email ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to update email' });
    }
  }
  
  /**
   * Generate a suggested reply for an email
   */
  public async suggestReply(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const email = await this.elasticsearchService.getEmail(id);
      
      if (!email) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      
      const suggestedReply = await this.ragService.generateSuggestedReply(email);
      
      res.json({ reply: suggestedReply });
    } catch (error) {
      logger.error(`Error generating suggested reply for email ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to generate suggested reply' });
    }
  }
  
  /**
   * Get account folders and email counts
   */
  public async getAccountFolders(req: Request, res: Response): Promise<void> {
    try {
      const folders = await this.elasticsearchService.getAccountFolders();
      res.json(folders);
    } catch (error) {
      logger.error('Error getting account folders:', error);
      res.status(500).json({ error: 'Failed to retrieve account folders' });
    }
  }
}