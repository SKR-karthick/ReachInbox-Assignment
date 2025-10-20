import { EmailDocument, EmailCategory } from '../models/email';
import logger from '../utils/logger';
import EventEmitter from 'events';
import * as Imap from 'imap';
import { simpleParser } from 'mailparser';
import { v4 as uuidv4 } from 'uuid';

export interface ImapAccountConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export class ImapSyncService extends EventEmitter {
  private accounts: Map<string, Imap> = new Map();
  private connectionsActive: Map<string, boolean> = new Map();
  private watchdogTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private accountConfigs: ImapAccountConfig[]) {
    super();
    
    // Initialize connections for each account
    if (accountConfigs.length === 0) {
      logger.error('No IMAP account configurations provided');
    }
  }

  /**
   * Start synchronization for all configured accounts
   */
  public async startSync(): Promise<void> {
    for (const config of this.accountConfigs) {
      try {
        await this.connectAccount(config);
      } catch (error) {
        logger.error(`Failed to connect to account ${config.user}:`, error);
      }
    }
  }

  /**
   * Connect to a single IMAP account
   */
  private async connectAccount(config: ImapAccountConfig): Promise<void> {
    const accountId = config.user;
    logger.info(`Connecting to IMAP account: ${accountId}`);

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false } // For development only - remove in production!
    });

    // Setup event handlers
    imap.once('ready', () => this.onImapReady(accountId, imap));
    imap.once('error', (err: Error) => this.onImapError(accountId, err));
    imap.once('end', () => this.onImapEnd(accountId));

    // Store the connection
    this.accounts.set(accountId, imap);
    
    // Connect to the server
    imap.connect();
  }

  /**
   * Handle IMAP ready event
   */
  private async onImapReady(accountId: string, imap: Imap): Promise<void> {
    logger.info(`IMAP connection ready for account: ${accountId}`);
    this.connectionsActive.set(accountId, true);

    try {
      // Initial sync - fetch last 30 days of emails
      await this.initialSync(accountId, imap);
      
      // Start IDLE mode for real-time updates
      await this.startIdleMode(accountId, imap);
    } catch (error) {
      logger.error(`Error during initial sync for ${accountId}:`, error);
    }
  }

  /**
   * Handle IMAP error event
   */
  private onImapError(accountId: string, error: Error): void {
    logger.error(`IMAP error for account ${accountId}:`, error);
    this.cleanupConnection(accountId);
    
    // Try to reconnect after a delay
    setTimeout(() => {
      const config = this.accountConfigs.find(cfg => cfg.user === accountId);
      if (config) {
        this.connectAccount(config);
      }
    }, 30000); // 30 seconds delay before reconnecting
  }

  /**
   * Handle IMAP end event
   */
  private onImapEnd(accountId: string): void {
    logger.info(`IMAP connection ended for account: ${accountId}`);
    this.cleanupConnection(accountId);
    
    // Try to reconnect if it wasn't a deliberate disconnect
    if (this.connectionsActive.get(accountId)) {
      const config = this.accountConfigs.find(cfg => cfg.user === accountId);
      if (config) {
        logger.info(`Attempting to reconnect to account: ${accountId}`);
        setTimeout(() => this.connectAccount(config), 5000); // 5 seconds delay
      }
    }
  }

  /**
   * Clean up connection resources
   */
  private cleanupConnection(accountId: string): void {
    this.connectionsActive.set(accountId, false);
    
    // Clear watchdog timer if exists
    const timer = this.watchdogTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.watchdogTimers.delete(accountId);
    }
  }

  /**
   * Perform initial sync of emails from the last 30 days
   */
  private async initialSync(accountId: string, imap: Imap): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Open the INBOX
        imap.openBox('INBOX', false, (err, mailbox) => {
          if (err) {
            logger.error(`Error opening INBOX for ${accountId}:`, err);
            return reject(err);
          }

          logger.info(`Opened INBOX for ${accountId}, message count: ${mailbox.messages.total}`);

          // Calculate date 30 days ago
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          // Search for emails from the last 30 days
          const searchCriteria = [
            ['SINCE', thirtyDaysAgo.toISOString()]
          ];
          
          imap.search(searchCriteria, (searchErr, results) => {
            if (searchErr) {
              logger.error(`Error searching emails for ${accountId}:`, searchErr);
              return reject(searchErr);
            }
            
            logger.info(`Found ${results.length} emails in the last 30 days for ${accountId}`);
            
            if (results.length === 0) {
              return resolve();
            }
            
            // Fetch emails in batches to avoid overwhelming the server
            const batchSize = 10;
            const batches = [];
            
            for (let i = 0; i < results.length; i += batchSize) {
              batches.push(results.slice(i, i + batchSize));
            }
            
            // Process each batch sequentially
            const processBatch = async (batchIndex: number) => {
              if (batchIndex >= batches.length) {
                return resolve();
              }
              
              const batch = batches[batchIndex];
              const fetch = imap.fetch(batch, { 
                bodies: ['HEADER.FIELDS (FROM TO CC BCC SUBJECT DATE)', 'TEXT'],
                struct: true 
              });
              
              let processedCount = 0;
              
              fetch.on('message', (msg, seqno) => {
                const email: Partial<EmailDocument> = {
                  id: uuidv4(),
                  accountId,
                  folder: 'INBOX',
                  read: false,
                  aiCategory: 'Uncategorized',
                  indexedAt: new Date()
                };
                
                msg.on('body', (stream, info) => {
                  let buffer = '';
                  
                  stream.on('data', (chunk) => {
                    buffer += chunk.toString('utf8');
                  });
                  
                  stream.once('end', async () => {
                    // Parse header or body depending on which part we received
                    if (info.which.startsWith('HEADER')) {
                      const parsedHeader = Imap.parseHeader(buffer);
                      
                      email.subject = parsedHeader.subject?.[0] || '(No Subject)';
                      email.from = parsedHeader.from?.[0] || '';
                      email.to = parsedHeader.to || [];
                      email.cc = parsedHeader.cc || [];
                      email.bcc = parsedHeader.bcc || [];
                      
                      if (parsedHeader.date?.[0]) {
                        email.date = new Date(parsedHeader.date[0]);
                      } else {
                        email.date = new Date();
                      }
                    } else {
                      // This is the message body
                      try {
                        const parsed = await simpleParser(buffer);
                        email.body = parsed.text || '';
                        email.bodyHtml = parsed.html || undefined;
                        
                        // Process attachments if any
                        if (parsed.attachments && parsed.attachments.length > 0) {
                          email.attachments = parsed.attachments.map(att => ({
                            filename: att.filename || 'unnamed',
                            contentType: att.contentType,
                            size: att.size
                          }));
                        }
                      } catch (parseError) {
                        logger.error(`Error parsing email body: ${parseError}`);
                        email.body = buffer; // Fallback to raw buffer
                      }
                    }
                  });
                });
                
                msg.once('attributes', (attrs) => {
                  // Store the IMAP UID for future reference
                  email.id = `${accountId}-${attrs.uid}`;
                  email.read = (attrs.flags || []).includes('\\Seen');
                });
                
                msg.once('end', () => {
                  // Emit the email to be processed by listeners
                  if (email.subject && email.body) {
                    this.emit('emailReceived', email as EmailDocument);
                  }
                  
                  processedCount++;
                  
                  // If we've processed all emails in this batch, move to the next batch
                  if (processedCount === batch.length) {
                    logger.info(`Processed batch ${batchIndex + 1}/${batches.length} for ${accountId}`);
                    processBatch(batchIndex + 1);
                  }
                });
              });
              
              fetch.once('error', (fetchErr) => {
                logger.error(`Fetch error for ${accountId}:`, fetchErr);
                reject(fetchErr);
              });
              
              fetch.once('end', () => {
                logger.debug(`Batch ${batchIndex + 1} fetch completed for ${accountId}`);
              });
            };
            
            // Start processing the first batch
            processBatch(0);
          });
        });
      } catch (error) {
        logger.error(`Error during initial sync for ${accountId}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Start IDLE mode for real-time updates
   */
  private async startIdleMode(accountId: string, imap: Imap): Promise<void> {
    logger.info(`Starting IDLE mode for account: ${accountId}`);
    
    // Set up a watchdog timer to restart IDLE every 29 minutes
    // (IDLE typically times out after 30 minutes)
    const restartIdle = () => {
      if (this.connectionsActive.get(accountId)) {
        try {
          imap.idle();
          
          // Set watchdog timer to restart IDLE before server timeout
          const watchdogTimer = setTimeout(() => {
            logger.debug(`Restarting IDLE for ${accountId} (watchdog)`);
            try {
              imap.idle(false); // Stop current IDLE
              restartIdle(); // Restart IDLE
            } catch (error) {
              logger.error(`Error in IDLE watchdog for ${accountId}:`, error);
            }
          }, 29 * 60 * 1000); // 29 minutes
          
          this.watchdogTimers.set(accountId, watchdogTimer);
        } catch (error) {
          logger.error(`Error starting IDLE mode for ${accountId}:`, error);
        }
      }
    };
    
    // Listen for new emails
    imap.on('mail', (numNewMsgs: number) => {
      logger.info(`${numNewMsgs} new message(s) arrived for ${accountId}`);
      this.fetchNewEmails(accountId, imap, numNewMsgs);
    });
    
    // Start IDLE mode
    restartIdle();
  }

  /**
   * Fetch new emails when they arrive
   */
  private fetchNewEmails(accountId: string, imap: Imap, numNewMsgs: number): void {
    // Temporarily disable IDLE mode to fetch messages
    try {
      imap.idle(false);
      
      // Get the current message count
      const box = imap._box;
      if (!box) {
        logger.error(`Mailbox not open for ${accountId}`);
        this.startIdleMode(accountId, imap); // Restart IDLE
        return;
      }
      
      const total = box.messages.total;
      const lastMessages = total - numNewMsgs + 1;
      
      // Fetch only the new messages
      const fetch = imap.seq.fetch(`${lastMessages}:${total}`, { 
        bodies: ['HEADER.FIELDS (FROM TO CC BCC SUBJECT DATE)', 'TEXT'],
        struct: true 
      });
      
      fetch.on('message', (msg, seqno) => {
        const email: Partial<EmailDocument> = {
          id: uuidv4(),
          accountId,
          folder: 'INBOX',
          read: false,
          aiCategory: 'Uncategorized',
          indexedAt: new Date()
        };
        
        msg.on('body', (stream, info) => {
          let buffer = '';
          
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
          
          stream.once('end', async () => {
            // Parse header or body depending on which part we received
            if (info.which.startsWith('HEADER')) {
              const parsedHeader = Imap.parseHeader(buffer);
              
              email.subject = parsedHeader.subject?.[0] || '(No Subject)';
              email.from = parsedHeader.from?.[0] || '';
              email.to = parsedHeader.to || [];
              email.cc = parsedHeader.cc || [];
              email.bcc = parsedHeader.bcc || [];
              
              if (parsedHeader.date?.[0]) {
                email.date = new Date(parsedHeader.date[0]);
              } else {
                email.date = new Date();
              }
            } else {
              // This is the message body
              try {
                const parsed = await simpleParser(buffer);
                email.body = parsed.text || '';
                email.bodyHtml = parsed.html || undefined;
                
                // Process attachments if any
                if (parsed.attachments && parsed.attachments.length > 0) {
                  email.attachments = parsed.attachments.map(att => ({
                    filename: att.filename || 'unnamed',
                    contentType: att.contentType,
                    size: att.size
                  }));
                }
              } catch (parseError) {
                logger.error(`Error parsing email body: ${parseError}`);
                email.body = buffer; // Fallback to raw buffer
              }
            }
          });
        });
        
        msg.once('attributes', (attrs) => {
          // Store the IMAP UID for future reference
          email.id = `${accountId}-${attrs.uid}`;
          email.read = (attrs.flags || []).includes('\\Seen');
        });
        
        msg.once('end', () => {
          // Emit the email to be processed by listeners
          if (email.subject && email.body) {
            this.emit('emailReceived', email as EmailDocument);
          }
        });
      });
      
      fetch.once('error', (error) => {
        logger.error(`Error fetching new messages for ${accountId}:`, error);
      });
      
      fetch.once('end', () => {
        logger.debug(`Finished fetching new messages for ${accountId}`);
        this.startIdleMode(accountId, imap); // Restart IDLE
      });
    } catch (error) {
      logger.error(`Error handling new messages for ${accountId}:`, error);
      this.startIdleMode(accountId, imap); // Restart IDLE
    }
  }

  /**
   * Stop all IMAP connections
   */
  public async stopSync(): Promise<void> {
    for (const [accountId, imap] of this.accounts.entries()) {
      try {
        this.connectionsActive.set(accountId, false);
        
        // Clear watchdog timer
        const timer = this.watchdogTimers.get(accountId);
        if (timer) {
          clearTimeout(timer);
          this.watchdogTimers.delete(accountId);
        }
        
        // Close the connection
        imap.end();
        logger.info(`Closed IMAP connection for ${accountId}`);
      } catch (error) {
        logger.error(`Error closing IMAP connection for ${accountId}:`, error);
      }
    }
    
    // Clear all collections
    this.accounts.clear();
    this.connectionsActive.clear();
    this.watchdogTimers.clear();
  }
}