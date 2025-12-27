import express from 'express';
import cookieParser from 'cookie-parser';
import createAuthRoutes from '../../modules/auth/auth.routes.js';
import cnicRoutes from '../../modules/cnic/cnic.routes.js';
import jobRoutes from '../../modules/jobs/job.routes.js';
import proposalRoutes from '../../modules/proposals/proposal.routes.js';
import messageRoutes from '../../modules/messages/message.routes.js';
import contractRoutes from '../../modules/contracts/contract.routes.js';

export default function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use('/api/auth', createAuthRoutes());
  app.use('/api/cnic', cnicRoutes);
  // Mount jobs and proposals for integration tests
  app.use('/api/jobs', jobRoutes);
  app.use('/api/proposals', proposalRoutes);

  // Mount messages and contracts for integration tests
  app.use('/api/messages', messageRoutes);
  app.use('/api/contracts', contractRoutes);

  // Simple health endpoint
  app.get('/health', (req, res) => res.json({ success: true }));

  return app;
}