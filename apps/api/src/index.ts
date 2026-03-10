import { app } from './app';

const PORT = parseInt(process.env.PORT || '80');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AgentsPay API running on port ${PORT}`);
});
