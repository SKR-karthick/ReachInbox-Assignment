export type EmailCategory = 'Interested' | 'Meeting Booked' | 'Not Interested' | 'Spam' | 'Out of Office' | 'Uncategorized';

export interface EmailDocument {
  id: string; // Unique message ID
  accountId: string; // Email account identifier
  folder: string; // INBOX, Sent, etc.
  subject: string;
  body: string; // Plain text content
  bodyHtml?: string; // HTML content if available
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  date: Date;
  attachments?: {
    filename: string;
    contentType: string;
    size: number;
  }[];
  read: boolean;
  aiCategory: EmailCategory;
  // Elasticsearch metadata
  indexedAt: Date;
}

export interface SearchParams {
  query?: string; // Text search query
  accountId?: string; // Filter by account
  folder?: string; // Filter by folder
  category?: EmailCategory; // Filter by AI category
  from?: string; // Filter by sender
  to?: string; // Filter by recipient
  dateFrom?: Date; // Filter by date range start
  dateTo?: Date; // Filter by date range end
  page: number; // Pagination
  limit: number; // Items per page
}

export interface SearchResult {
  total: number;
  page: number;
  limit: number;
  results: EmailDocument[];
}