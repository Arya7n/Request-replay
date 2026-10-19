import { createApp } from './app';
import { readEnv } from './env';

const env = readEnv();
const app = createApp(env.allowedOrigin);

app.listen(env.port, '127.0.0.1', () => {
  console.log(`RequestReplay compare API listening on http://127.0.0.1:${env.port}`);
});
