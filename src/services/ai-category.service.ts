import { EmailDocument, EmailCategory } from '../models/email';
import logger from '../utils/logger';
import fetch from 'node-fetch';

interface CategoryResponse {
  category: EmailCategory;
}

export class AICategoryService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  /**
   * Categorize an email using the Gemini API
   */
  public async categorizeEmail(email: EmailDocument): Promise<EmailCategory> {
    try {
      // Extract the relevant email content for categorization
      const emailContent = this.prepareEmailContent(email);
      
      // Create the prompt with system instructions and content
      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: this.buildPrompt(emailContent)
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          topP: 0.1,
          topK: 16,
          maxOutputTokens: 100,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              category: {
                type: "STRING",
                enum: ["Interested", "Meeting Booked", "Not Interested", "Spam", "Out of Office"]
              }
            },
            required: ["category"]
          }
        }
      };
      
      // Call the Gemini API
      const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Gemini API error (${response.status}): ${errorText}`);
        return 'Uncategorized'; // Default category on error
      }
      
      const data = await response.json();
      
      // Extract the JSON response from the text
      const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        logger.error('No valid response from Gemini API');
        return 'Uncategorized';
      }
      
      // Parse the JSON string into an object
      try {
        const parsedResult = JSON.parse(candidateText) as CategoryResponse;
        return parsedResult.category;
      } catch (parseError) {
        logger.error('Error parsing Gemini API response:', parseError);
        return 'Uncategorized';
      }
    } catch (error) {
      logger.error('Error categorizing email:', error);
      return 'Uncategorized';
    }
  }
  
  /**
   * Extract the relevant content from an email for categorization
   */
  private prepareEmailContent(email: EmailDocument): string {
    // Combine relevant email fields for context
    return `
      From: ${email.from}
      To: ${email.to.join(', ')}
      Subject: ${email.subject}
      
      ${email.body}
    `.trim();
  }
  
  /**
   * Build the prompt with system instructions
   */
  private buildPrompt(emailContent: string): string {
    return `
      You are an expert email classifier. Your task is to analyze the provided email text and categorize it into one of the following labels:
      
      - Interested: The sender shows interest in your product, service, or proposition
      - Meeting Booked: The sender has confirmed a meeting or appointment
      - Not Interested: The sender explicitly declines or shows no interest
      - Spam: The email is unsolicited, promotional, or irrelevant
      - Out of Office: An automatic reply indicating the recipient is unavailable
      
      Please analyze the following email and respond with ONLY a JSON object containing the category.
      
      EMAIL:
      ${emailContent}
    `.trim();
  }

  /**
   * Helper method with exponential backoff retry logic
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 5,
    initialDelay = 1000
  ): Promise<T> {
    let retries = 0;
    let delay = initialDelay;
    
    while (true) {
      try {
        return await operation();
      } catch (error) {
        retries++;
        
        if (retries >= maxRetries) {
          throw error;
        }
        
        logger.info(`Retry ${retries}/${maxRetries} after ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }
}