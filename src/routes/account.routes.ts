import { Router } from 'express';
import { EmailController } from '../controllers/email.controller';

export const createAccountRouter = (emailController: EmailController): Router => {
  const router = Router();
  
  // Get all account folders and email counts
  router.get('/', emailController.getAccountFolders.bind(emailController));
  
  return router;
};