import { isPromise } from '../shared/validation';
import { LIMITS } from '../shared/types';

export async function callWithCallbackOrPromise(
  invoke: (callback: (value: unknown) => void) => unknown,
  timeoutMs = LIMITS.harTimeoutMs,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error('DevTools call failed'));
    };
    const timeout = setTimeout(() => fail(new Error('Timed out reading the DevTools network log.')), timeoutMs);

    try {
      const returned = invoke((value) => finish(value));
      if (isPromise(returned)) void returned.then(finish, fail);
    } catch (error) {
      fail(error);
    }
  });
}
