# ReachInbox Email Aggregator

A feature-rich onebox email aggregator with real-time synchronization and AI capabilities.

## Features Implemented

1. ✅ **Real-Time Email Synchronization**
   - Syncs multiple IMAP accounts in real-time using IDLE mode
   - Fetches the last 30 days of emails
   - Maintains persistent IMAP connections for real-time updates

2. ✅ **Searchable Storage using Elasticsearch**
   - Stores emails in a locally hosted Elasticsearch instance
   - Implements full-text search across email contents
   - Supports filtering by folder, account, and AI category

3. ✅ **AI-Based Email Categorization**
   - Uses Google's Gemini API to categorize emails into 5 categories:
     - Interested
     - Meeting Booked
     - Not Interested
     - Spam
     - Out of Office

4. ✅ **Slack & Webhook Integration**
   - Sends Slack notifications for every new 'Interested' email
   - Triggers webhooks to webhook.site for external automation

5. ✅ **Frontend Interface**
   - Clean, responsive UI to display emails with search functionality
   - Filters by folder/account and shows AI categorization
   - Displays email details and suggested replies

6. ✅ **AI-Powered Suggested Replies (RAG)**
   - Stores product and outreach data in a Qdrant vector database
   - Uses RAG (Retrieval-Augmented Generation) with Gemini API
   - Generates contextually relevant replies based on stored knowledge

## Prerequisites

- Node.js (v16 or higher)
- Docker and Docker Compose
- Two or more email accounts for IMAP access
- Google Gemini API key

## Architecture Overview

![Architecture Diagram](https://i.imgur.com/YourDiagramImage.png)

The application follows a modular architecture with the following components:

1. **IMAP Sync Service** - Handles real-time email synchronization using IDLE mode
2. **Elasticsearch Service** - Manages email storage and search functionality
3. **AI Category Service** - Categorizes emails using Gemini API
4. **Webhook Service** - Sends notifications to Slack and external systems
5. **RAG Service** - Generates suggested replies using Vector DB and LLM
6. **API Layer** - Express.js REST API for frontend communication
7. **Frontend** - Simple UI built with HTML, CSS and JavaScript

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd reachinbox-onebox
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example env file and update with your values:

```bash
cp .env.example .env
```

Edit the `.env` file with your IMAP account details, Gemini API key, and webhook URLs.

### 4. Start Docker Containers

```bash
docker-compose up -d
```

This starts the Elasticsearch and Qdrant containers.

### 5. Build and Run the Application

```bash
npm run build
npm start
```

The application will be available at http://localhost:3000

## Environment Variables

Create a `.env` file with the following variables:

```
# Server Configuration
PORT=3000

# IMAP Configuration - First Account
IMAP_USER_1=user@example.com
IMAP_PASSWORD_1=your_password
IMAP_HOST_1=imap.example.com
IMAP_PORT_1=993
IMAP_TLS_1=true

# IMAP Configuration - Second Account
IMAP_USER_2=user2@example.com
IMAP_PASSWORD_2=your_password
IMAP_HOST_2=imap.example.com
IMAP_PORT_2=993
IMAP_TLS_2=true

# Elasticsearch Configuration
ELASTICSEARCH_HOST=http://localhost:9200

# Vector Database Configuration
QDRANT_HOST=http://localhost:6333

# AI Configuration
GEMINI_API_KEY=your_gemini_api_key

# Webhook Configuration
SLACK_WEBHOOK_URL=your_slack_webhook_url
EXTERNAL_WEBHOOK_URL=your_webhook_site_url
```

## API Endpoints

### Account Endpoints
- `GET /api/accounts` - List all configured accounts and folders

### Email Endpoints
- `GET /api/emails` - Get all emails (paginated)
- `GET /api/emails/:id` - Get email by ID
- `GET /api/emails/search` - Search emails with filters
- `PATCH /api/emails/:id` - Update email properties
- `POST /api/emails/:id/suggest-reply` - Generate AI-suggested reply

## Future Enhancements

1. Support for more email providers (OAuth2 authentication)
2. Advanced email filtering rules
3. Email thread grouping and conversation view
4. Mobile responsive UI improvements
5. User authentication and multi-user support
6. More AI-powered features like summarization and priority scoring

## License

ISC