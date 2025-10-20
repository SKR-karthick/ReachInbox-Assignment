import { Client } from '@elastic/elasticsearch';
import { EmailDocument, EmailCategory, SearchParams, SearchResult } from '../models/email';
import logger from '../utils/logger';

export class ElasticsearchService {
  private client: Client;
  private indexName = 'emails';
  private isIndexCreated = false;

  constructor(host: string) {
    this.client = new Client({ node: host });
  }

  /**
   * Initialize the Elasticsearch index
   */
  public async init(): Promise<void> {
    try {
      // Check if index exists
      const indexExists = await this.client.indices.exists({ index: this.indexName });
      
      if (!indexExists) {
        logger.info(`Creating Elasticsearch index: ${this.indexName}`);
        
        // Create index with mapping
        await this.client.indices.create({
          index: this.indexName,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              accountId: { type: 'keyword' },
              folder: { type: 'keyword' },
              subject: { type: 'text' },
              body: { type: 'text' },
              bodyHtml: { type: 'text', index: false }, // Not searchable
              from: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              to: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              cc: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              bcc: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              date: { type: 'date' },
              read: { type: 'boolean' },
              aiCategory: { type: 'keyword' },
              indexedAt: { type: 'date' }
            }
          }
        });
        
        logger.info(`Created Elasticsearch index: ${this.indexName}`);
      } else {
        logger.info(`Elasticsearch index ${this.indexName} already exists`);
      }
      
      this.isIndexCreated = true;
    } catch (error) {
      logger.error('Error initializing Elasticsearch:', error);
      throw error;
    }
  }

  /**
   * Index an email document in Elasticsearch
   */
  public async indexEmail(email: EmailDocument): Promise<string> {
    if (!this.isIndexCreated) {
      await this.init();
    }
    
    try {
      const result = await this.client.index({
        index: this.indexName,
        id: email.id,
        document: {
          ...email,
          indexedAt: new Date()
        }
      });
      
      logger.debug(`Indexed email ${email.id} in Elasticsearch`);
      return result._id;
    } catch (error) {
      logger.error(`Error indexing email ${email.id}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing email document in Elasticsearch
   */
  public async updateEmail(id: string, updates: Partial<EmailDocument>): Promise<void> {
    try {
      await this.client.update({
        index: this.indexName,
        id,
        doc: updates
      });
      
      logger.debug(`Updated email ${id} in Elasticsearch`);
    } catch (error) {
      logger.error(`Error updating email ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get an email document by ID
   */
  public async getEmail(id: string): Promise<EmailDocument | null> {
    try {
      const result = await this.client.get<EmailDocument>({
        index: this.indexName,
        id
      });
      
      return result._source || null;
    } catch (error) {
      if ((error as any).statusCode === 404) {
        return null;
      }
      
      logger.error(`Error getting email ${id}:`, error);
      throw error;
    }
  }

  /**
   * Search for emails with various filters
   */
  public async searchEmails(params: SearchParams): Promise<SearchResult> {
    try {
      // Build the search query based on provided parameters
      const query: any = {
        bool: {
          must: [],
          filter: []
        }
      };
      
      // Full-text search on subject and body
      if (params.query) {
        query.bool.must.push({
          multi_match: {
            query: params.query,
            fields: ['subject^2', 'body', 'from', 'to'] // Subject has higher weight
          }
        });
      }
      
      // Apply filters using exact matching
      if (params.accountId) {
        query.bool.filter.push({ term: { accountId: params.accountId } });
      }
      
      if (params.folder) {
        query.bool.filter.push({ term: { folder: params.folder } });
      }
      
      if (params.category) {
        query.bool.filter.push({ term: { aiCategory: params.category } });
      }
      
      if (params.from) {
        query.bool.filter.push({ term: { 'from.keyword': params.from } });
      }
      
      if (params.to) {
        query.bool.filter.push({ term: { 'to.keyword': params.to } });
      }
      
      // Date range filter
      if (params.dateFrom || params.dateTo) {
        const dateRange: any = {};
        
        if (params.dateFrom) {
          dateRange.gte = params.dateFrom.toISOString();
        }
        
        if (params.dateTo) {
          dateRange.lte = params.dateTo.toISOString();
        }
        
        query.bool.filter.push({ range: { date: dateRange } });
      }
      
      // If no search criteria, match all documents
      if (query.bool.must.length === 0 && query.bool.filter.length === 0) {
        query.bool.must.push({ match_all: {} });
      }
      
      // Execute the search with pagination
      const result = await this.client.search<EmailDocument>({
        index: this.indexName,
        query,
        sort: [{ date: { order: 'desc' } }], // Most recent emails first
        from: (params.page - 1) * params.limit,
        size: params.limit
      });
      
      // Format the response
      return {
        total: result.hits.total?.value || 0,
        page: params.page,
        limit: params.limit,
        results: result.hits.hits.map(hit => hit._source as EmailDocument)
      };
    } catch (error) {
      logger.error('Error searching emails:', error);
      throw error;
    }
  }

  /**
   * Get account folders and email counts
   */
  public async getAccountFolders(): Promise<{ accountId: string; folder: string; count: number }[]> {
    try {
      const result = await this.client.search({
        index: this.indexName,
        size: 0,
        aggs: {
          accounts: {
            terms: { field: 'accountId' },
            aggs: {
              folders: {
                terms: { field: 'folder' }
              }
            }
          }
        }
      });
      
      const folderCounts: { accountId: string; folder: string; count: number }[] = [];
      
      const buckets = result.aggregations?.accounts?.buckets || [];
      for (const accountBucket of buckets) {
        const accountId = accountBucket.key as string;
        const folderBuckets = accountBucket.folders?.buckets || [];
        
        for (const folderBucket of folderBuckets) {
          folderCounts.push({
            accountId,
            folder: folderBucket.key as string,
            count: folderBucket.doc_count as number
          });
        }
      }
      
      return folderCounts;
    } catch (error) {
      logger.error('Error getting account folders:', error);
      throw error;
    }
  }

  /**
   * Delete an email by ID
   */
  public async deleteEmail(id: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.indexName,
        id
      });
      
      logger.debug(`Deleted email ${id} from Elasticsearch`);
    } catch (error) {
      logger.error(`Error deleting email ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update the AI category for an email
   */
  public async updateCategory(id: string, category: EmailCategory): Promise<void> {
    await this.updateEmail(id, { aiCategory: category });
  }
}