import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

interface Config {
  port: number;
  elasticsearch: {
    host: string;
  };
  qdrant: {
    host: string;
  };
  gemini: {
    apiKey: string;
  };
  webhooks: {
    slack: string;
    external: string;
  };
  imapAccounts: ImapConfig[];
}

// Load IMAP accounts dynamically from environment variables
const imapAccounts: ImapConfig[] = [];
let accountIndex = 1;

while (process.env[`IMAP_USER_${accountIndex}`]) {
  imapAccounts.push({
    user: process.env[`IMAP_USER_${accountIndex}`] || '',
    password: process.env[`IMAP_PASSWORD_${accountIndex}`] || '',
    host: process.env[`IMAP_HOST_${accountIndex}`] || '',
    port: parseInt(process.env[`IMAP_PORT_${accountIndex}`] || '993', 10),
    tls: process.env[`IMAP_TLS_${accountIndex}`] === 'true',
  });
  accountIndex++;
}

const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  elasticsearch: {
    host: process.env.ELASTICSEARCH_HOST || 'http://localhost:9200',
  },
  qdrant: {
    host: process.env.QDRANT_HOST || 'http://localhost:6333',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  webhooks: {
    slack: process.env.SLACK_WEBHOOK_URL || '',
    external: process.env.EXTERNAL_WEBHOOK_URL || '',
  },
  imapAccounts,
};

export default config;