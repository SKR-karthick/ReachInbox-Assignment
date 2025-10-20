# Quick Start Guide

## ✅ Dependencies Installed Successfully!

Now follow these steps to run the project:

## Step 1: Configure Environment Variables

Edit the `.env` file that was just created and update it with your values:

```
# Server Configuration
PORT=3000

# IMAP Configuration - First Account
IMAP_USER_1=your_email@gmail.com
IMAP_PASSWORD_1=your_app_password
IMAP_HOST_1=imap.gmail.com
IMAP_PORT_1=993
IMAP_TLS_1=true

# IMAP Configuration - Second Account
IMAP_USER_2=second_email@gmail.com
IMAP_PASSWORD_2=your_app_password
IMAP_HOST_2=imap.gmail.com
IMAP_PORT_2=993
IMAP_TLS_2=true

# Elasticsearch Configuration
ELASTICSEARCH_HOST=http://localhost:9200

# Vector Database Configuration
QDRANT_HOST=http://localhost:6333

# AI Configuration (Get from https://makersuite.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key_here

# Webhook Configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
EXTERNAL_WEBHOOK_URL=https://webhook.site/your-unique-url
```

### Important Notes:
- For Gmail, you need to use an "App Password" instead of your regular password
  - Go to https://myaccount.google.com/apppasswords to create one
- Get a Gemini API key from: https://makersuite.google.com/app/apikey
- Get a webhook URL for testing from: https://webhook.site/

## Step 2: Start Docker Containers

Start Elasticsearch and Qdrant:

```powershell
docker-compose up -d
```

Wait for the containers to be ready (about 30 seconds). You can check with:

```powershell
docker ps
```

## Step 3: Build the Project

Compile the TypeScript code:

```powershell
npm run build
```

## Step 4: Run the Application

Start the server:

```powershell
npm start
```

OR for development with auto-reload:

```powershell
npm run dev
```

## Step 5: Access the Application

Open your browser and go to:

```
http://localhost:3000
```

## Troubleshooting

### If npm install failed:
- Make sure you have Node.js v16 or higher installed
- Delete `node_modules` folder and `package-lock.json`, then run `npm install` again

### If Docker containers won't start:
- Make sure Docker Desktop is running
- Check if ports 9200 and 6333 are not already in use
- Run: `docker-compose down` then `docker-compose up -d`

### If emails aren't syncing:
- Check your IMAP credentials in the `.env` file
- Make sure you're using App Passwords for Gmail accounts
- Check the console logs for error messages

### If AI features aren't working:
- Verify your Gemini API key is valid
- Check your API quota at: https://makersuite.google.com/

## Testing the Features

1. **Email Sync**: The system will automatically start syncing emails when you run it
2. **Search**: Use the search box in the UI to search for emails
3. **Filtering**: Filter by account, folder, or AI category
4. **AI Categorization**: Emails are automatically categorized
5. **Suggested Replies**: Click on an email and click "Generate AI Reply"

## Need Help?

Check the logs in the console for detailed error messages.
