import { afterEach, describe, expect, it } from 'vitest';
import { assertSourceUrlAllowed } from './sourceUrl';

describe('assertSourceUrlAllowed', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  it('allows public http and https source URLs', () => {
    expect(() => assertSourceUrlAllowed('https://example.com/guide.xml')).not.toThrow();
    expect(() => assertSourceUrlAllowed('http://feeds.example.com/guide.xml')).not.toThrow();
  });

  it('rejects non-http source URLs', () => {
    expect(() => assertSourceUrlAllowed('file:///etc/passwd')).toThrow('http or https');
  });

  it('allows localhost source URLs outside production for development', () => {
    process.env.NODE_ENV = 'development';

    expect(() => assertSourceUrlAllowed('http://localhost:3000/guide.xml')).not.toThrow();
  });

  it('rejects obvious private network source URLs in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => assertSourceUrlAllowed('http://localhost:3000/guide.xml')).toThrow('private network');
    expect(() => assertSourceUrlAllowed('http://127.0.0.1/guide.xml')).toThrow('private network');
    expect(() => assertSourceUrlAllowed('http://10.0.0.5/guide.xml')).toThrow('private network');
    expect(() => assertSourceUrlAllowed('http://192.168.1.10/guide.xml')).toThrow('private network');
    expect(() => assertSourceUrlAllowed('http://172.16.0.5/guide.xml')).toThrow('private network');
    expect(() => assertSourceUrlAllowed('http://169.254.169.254/latest/meta-data')).toThrow('private network');
  });
});
