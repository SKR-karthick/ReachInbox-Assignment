import { Router } from 'express';
import { EmailController } from '../controllers/email.controller';

export const createEmailRouter = (emailController: EmailController): Router => {
  const router = Router();
  
  // Get all emails (with search/filter)
  router.get('/', emailController.getEmails.bind(emailController));
  
  // Get a single email by ID
  router.get('/:id', emailController.getEmail.bind(emailController));
  
  // Update email properties (e.g., read status)
  router.patch('/:id', emailController.updateEmail.bind(emailController));
  
  // Generate a suggested reply for an email
  router.post('/:id/suggest-reply', emailController.suggestReply.bind(emailController));
  
  return router;
};