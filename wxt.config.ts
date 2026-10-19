import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'wxt';

function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replaceAll(' crossorigin', '');
      },
    },
  };
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'RequestReplay',
    description: 'Inspect DevTools requests, redact secrets, copy curl, and compare responses.',
    minimum_chrome_version: '116',
    permissions: ['storage'],
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    // Public extension key. It keeps the extension ID stable so the API can allow one origin.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtQjL5XS8KrUSYHLNNZoeM8HDStpUr9SF7VEYHjJ8txmeQJ319PhwsM9Hz1qM3BXy0J3ujAKZc4yDULfkFPHPB6Qy3ecPlvYXmUqVWijwkaKR45zmKrGd1rulbe8rTYmJs/130gpWBv+TWHwqRDthT1C4VZxG9v0CXlZgPr9cavg/xfY1cJm/xS3ifmsI5wk+qpaZ7izZETPN8N5qOFC7+TjGSuukFZJ66jqpu2C5uay0T9KQcb6U3HQOjxSIaoSHYHvJO3jRVzJhVHgdkwWwiUIDtEtZzP9xRTaOm1tWw4DXfiVb+gCf9a6NsxHLPSpQCXxqK9Rm3851GWwgQf5DlQIDAQAB',
  },
  vite: () => ({
    plugins: [tailwindcss(), stripCrossorigin()],
  }),
});
