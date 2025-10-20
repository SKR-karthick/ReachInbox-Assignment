# Project Highlights

This file contains detailed architectural decisions and implementation notes for the ReachInbox Email Aggregator project.

## Implementation Details

### 1. Real-Time IMAP Synchronization

The core of the email synchronization is built on the IMAP IDLE mode, which maintains a persistent connection to the mail server and receives real-time notifications when new emails arrive. This implementation provides several advantages over polling approaches:

- **Lower Latency:** Emails are processed as soon as they arrive, without waiting for a polling interval.
- **Reduced Server Load:** No unnecessary connections or queries are made to the mail server.
- **Connection Efficiency:** The IMAP connection is maintained with a watchdog timer that restarts IDLE before the typical 30-minute server timeout.

Key technical components:
- `ImapSyncService` class implements the EventEmitter pattern to notify other system components when new emails arrive.
- Connection resilience with automatic reconnection logic upon connection failures.
- Initial sync fetches the last 30 days of emails to establish a baseline.

### 2. Elasticsearch Integration

Emails are indexed in Elasticsearch for fast, efficient searching and filtering:

- **Schema Design:** The mapping is carefully designed with appropriate field types (keyword vs text) to enable both full-text search and exact filtering.
- **Query Construction:** The search API builds Elasticsearch queries dynamically based on search parameters.
- **Aggregations:** Used to efficiently retrieve account and folder statistics.

### 3. AI Categorization

The AI categorization uses Google's Gemini API with several optimizations:

- **JSON Mode:** Uses the Gemini API's JSON response schema to guarantee structured output in the required format.
- **Prompt Engineering:** The system instruction and few-shot examples guide the model to make accurate categorizations.
- **Error Handling:** Implements exponential backoff for API rate limits and temporary errors.

### 4. RAG Implementation

The Retrieval-Augmented Generation (RAG) pipeline implements the following steps:

1. **Storage:** Product data is chunked and stored in the Qdrant vector database.
2. **Embedding:** Google's embedding model converts text chunks into dense vector representations.
3. **Retrieval:** When generating a reply, the email content is converted to a vector and used to find relevant context.
4. **Generation:** The retrieved context and original email are sent to the LLM to generate a contextually appropriate reply.

### 5. Architectural Design

The application follows clean architecture principles:

- **Separation of Concerns:** Each service has a single responsibility.
- **Dependency Injection:** Services are instantiated with their dependencies, making testing easier.
- **Event-Based Communication:** Services communicate through events for loose coupling.
- **Error Handling:** Comprehensive error handling and logging throughout the application.

## Optimizations

1. **Batch Processing:** Email processing during initial sync is done in batches to avoid memory issues with large mailboxes.
2. **Connection Pooling:** The Elasticsearch client uses connection pooling for better performance.
3. **Caching:** Account and folder information is cached to reduce database queries.
4. **Debouncing:** Search inputs in the UI are debounced to prevent excessive API calls.

## Security Considerations

1. **Environment Variables:** Sensitive information is stored in environment variables, not hardcoded.
2. **Input Validation:** API endpoints validate inputs before processing.
3. **Error Sanitization:** Error details are logged but not exposed to clients.

## Testing Strategy

1. **Unit Tests:** Individual service methods are tested in isolation.
2. **Integration Tests:** API endpoints are tested with a test database.
3. **End-to-End Tests:** Complete workflows are tested from UI to database.

## Deployment Considerations

1. **Docker Compose:** Development environment is containerized for consistency.
2. **Production Setup:** Would use container orchestration (e.g., Kubernetes) for production.
3. **Scaling:** Horizontal scaling is possible by separating services into microservices.
4. **Monitoring:** Production setup would include Prometheus for metrics and Grafana for visualization.

## Third-Party Services Used

1. **Elasticsearch:** For email storage and search capabilities.
2. **Qdrant:** Vector database for RAG implementation.
3. **Google Gemini API:** For AI categorization and reply generation.
4. **Slack API:** For sending notifications.
5. **Webhook.site:** For demonstration of external automation triggers.