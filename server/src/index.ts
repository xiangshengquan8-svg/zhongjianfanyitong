import express from "express";
import cors from "cors";
import translateRouter from "./routes/translate.js";
import supabaseConfigRouter from "./routes/supabase-config.js";
import subscriptionRouter from "./routes/subscription.js";

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// Routes
app.use('/api/v1/supabase-config', supabaseConfigRouter);
app.use('/api/v1/subscription', subscriptionRouter);
app.use('/api/v1/translate', translateRouter);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
