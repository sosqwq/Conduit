import { basename } from 'node:path';
import { test as original, type Page } from 'playwright/test';

export * from 'playwright/test';

const demoPrefix = 'https://api.realworld.show/api/';
const mockFiles = new Set(['error-handling.spec.ts', 'user-fetch-errors.spec.ts']);

export const test = original.extend({
  page: async ({ page, baseURL }, use, info) => {
    if (!mockFiles.has(basename(info.file))) {
      await use(page);
      return;
    }
    const localPrefix = new URL('/api/', baseURL);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(localPrefix.hostname)) {
      throw new Error('The official mock adapter requires a loopback application URL');
    }
    // Preserve each upstream handler, its options and Playwright registration order.
    const register: Page['route'] = (matcher, handler, options) => {
      const local = typeof matcher === 'string' && matcher.startsWith(demoPrefix)
        ? localPrefix.href + matcher.slice(demoPrefix.length)
        : matcher;
      return page.route(local, handler, options);
    };
    const testPage = new Proxy(page, {
      get(target, name) {
        if (name === 'route') return register;
        const value = Reflect.get(target, name, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await use(testPage);
  },

  request: async ({ request, playwright }, use, info) => {
    const proxy = process.env.CONDUIT_E2E_HEALTH_PROXY;
    if (!proxy || basename(info.file) !== 'health.spec.ts') {
      await use(request);
      return;
    }
    // Only the upstream read-only demo health probe needs optional managed egress.
    const proxied = await playwright.request.newContext({
      proxy: { server: proxy, bypass: '127.0.0.1,localhost' },
    });
    try {
      await use(proxied);
    } finally {
      await proxied.dispose();
    }
  },
});
