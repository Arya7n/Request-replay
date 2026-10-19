const log = document.getElementById('log');

function write(message) {
  if (log) log.textContent = message;
}

async function run(name, action) {
  write(`${name}…`);
  try {
    const response = await action();
    const text = await response.text();
    write(`${name}\n${response.status} ${response.statusText}\n${text}`);
  } catch (error) {
    write(`${name}\nFailed before an HTTP response.\n${error instanceof Error ? error.name : 'Error'}`);
  }
}

document.getElementById('items')?.addEventListener('click', () => {
  void run('GET /api/items', () => fetch('/api/items?q=widget', { headers: { Accept: 'application/json' } }));
});

document.getElementById('session')?.addEventListener('click', () => {
  void run('POST /api/session', () =>
    fetch('/api/session?access_token=dummy-query-token-not-real', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer dummy-token-not-real',
        'X-Api-Key': 'dummy-api-key-not-real',
      },
      body: JSON.stringify({ username: 'demo-user', password: 'dummy-password-not-real' }),
    }),
  );
});

document.getElementById('missing')?.addEventListener('click', () => {
  void run('GET /api/missing', () => fetch('/api/missing'));
});

document.getElementById('boom')?.addEventListener('click', () => {
  void run('GET /api/boom', () => fetch('/api/boom'));
});

document.getElementById('offline')?.addEventListener('click', () => {
  void run('Connection refused', () => fetch('http://127.0.0.1:9/nope'));
});
