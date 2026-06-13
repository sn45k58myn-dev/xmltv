export {};

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: {
        actor: string;
        role: 'admin' | 'operator' | 'viewer';
        apiKeyId?: string;
      };
    }
  }
}
