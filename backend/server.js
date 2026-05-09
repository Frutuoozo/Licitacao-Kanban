import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import processesRouter from './routes/processes.js';
import templatesRouter from './routes/templates.js';
import adminRouter from './routes/admin.js';
import { verifyToken } from './middleware/auth.js';
import { requireAdmin } from './middleware/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount routers
app.use('/api/auth', authRouter);
app.use('/api/admin', verifyToken, requireAdmin, adminRouter);
app.use('/api/processes', verifyToken, processesRouter);
app.use('/api/templates', verifyToken, templatesRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
