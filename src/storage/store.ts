export type KeyValueStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
};

export class MemoryStore implements KeyValueStore {
  private values = new Map<string, unknown>();

  async get(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

export class FailingStore implements KeyValueStore {
  constructor(private readonly message = 'Storage quota exceeded') {}

  async get(): Promise<unknown> {
    return undefined;
  }

  async set(): Promise<void> {
    throw new Error(this.message);
  }

  async remove(): Promise<void> {
    throw new Error(this.message);
  }
}

export function storageErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The browser rejected the storage operation.';
}
