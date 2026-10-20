import { createApp } from './app';
import { readEnv } from './env';

const env = readEnv();
const app = createApp(env.allowedOrigin);

app.listen(env.port, env.host, () => {
  console.log(`RequestReplay compare API listening on port ${env.port}`);
});
