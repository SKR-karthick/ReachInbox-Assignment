import { EmailDocument } from '../models/email';
import logger from '../utils/logger';
import fetch from 'node-fetch';

export class WebhookService {
  private slackWebhookUrl: string;
  private externalWebhookUrl: string;
  
  constructor(slackWebhookUrl: string, externalWebhookUrl: string) {
    this.slackWebhookUrl = slackWebhookUrl;
    this.externalWebhookUrl = externalWebhookUrl;
  }
  
  /**
   * Send notifications for an interested email
   */
  public async notifyInterestedEmail(email: EmailDocument): Promise<void> {
    try {
      // Only send notifications for 'Interested' emails
      if (email.aiCategory !== 'Interested') {
        return;
      }
      
      // Send Slack notification
      await this.sendSlackNotification(email);
      
      // Send external webhook notification
      await this.sendExternalWebhook(email);
      
      logger.info(`Sent notifications for interested email ${email.id}`);
    } catch (error) {
      logger.error('Error sending notifications:', error);
    }
  }
  
  /**
   * Send a notification to Slack
   */
  private async sendSlackNotification(email: EmailDocument): Promise<void> {
    if (!this.slackWebhookUrl) {
      logger.warn('Slack webhook URL not configured');
      return;
    }
    
    try {
      const messageText = `New Interested Lead! 🎯\n\nFrom: ${email.from}\nSubject: ${email.subject}`;
      
      const slackPayload = {
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "🔥 New Interested Lead!",
              emoji: true
            }
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*From:*\n${email.from}`
              },
              {
                type: "mrkdwn",
                text: `*Account:*\n${email.accountId}`
              },
              {
                type: "mrkdwn",
                text: `*Subject:*\n${email.subject}`
              },
              {
                type: "mrkdwn",
                text: `*Date:*\n${email.date.toISOString().split('T')[0]}`
              }
            ]
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Email Preview:*\n${this.truncateText(email.body, 200)}`
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "View Email",
                  emoji: true
                },
                value: email.id,
                url: `http://localhost:3000/email/${email.id}`, // Frontend URL to view email details
                action_id: "view_email"
              }
            ]
          }
        ],
        text: messageText // Fallback text
      };
      
      const response = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(slackPayload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Slack API error (${response.status}): ${errorText}`);
      }
    } catch (error) {
      logger.error('Error sending Slack notification:', error);
    }
  }
  
  /**
   * Send data to the external webhook
   */
  private async sendExternalWebhook(email: EmailDocument): Promise<void> {
    if (!this.externalWebhookUrl) {
      logger.warn('External webhook URL not configured');
      return;
    }
    
    try {
      // Prepare payload for the external webhook
      const webhookPayload = {
        event: 'InterestedLead',
        timestamp: new Date().toISOString(),
        email: {
          id: email.id,
          accountId: email.accountId,
          subject: email.subject,
          from: email.from,
          to: email.to,
          date: email.date.toISOString(),
          category: email.aiCategory,
          body: this.truncateText(email.body, 500) // Truncate long emails
        }
      };
      
      const response = await fetch(this.externalWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`External webhook error (${response.status}): ${errorText}`);
      }
    } catch (error) {
      logger.error('Error sending external webhook:', error);
    }
  }
  
  /**
   * Helper method to truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength) + '...';
  }
}