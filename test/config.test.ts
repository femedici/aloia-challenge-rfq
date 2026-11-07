import { validateConfig } from '../src/common/config';

const valid = {
  DATABASE_URL: 'postgres://user:password@localhost:5432/rfq',
  ERP_BASE_URL: 'http://localhost:4000', ERP_API_TOKEN: 'test-erp',
  INTERNAL_API_KEY: 'test-api', WEBHOOK_SECRET: 'test-webhook', PORT: '3000',
};

describe('startup configuration', () => {
  it('accepts complete configuration and optional default port', () => {
    expect(() => validateConfig(valid)).not.toThrow();
    expect(() => validateConfig({ ...valid, PORT: undefined })).not.toThrow();
  });
  test.each(['DATABASE_URL', 'ERP_BASE_URL', 'ERP_API_TOKEN', 'INTERNAL_API_KEY', 'WEBHOOK_SECRET'])(
    'rejects missing or blank %s without including values', name => {
      for (const value of [undefined, '', '   ']) {
        expect(() => validateConfig({ ...valid, [name]: value })).toThrow(name);
      }
    },
  );
  test.each(['0', '-1', '1.5', 'NaN', '65536', '1e3', ''])(
    'rejects invalid PORT %s', port => expect(() => validateConfig({ ...valid, PORT: port })).toThrow('PORT'),
  );
  test.each([
    ['DATABASE_URL', 'http://localhost/database'], ['DATABASE_URL', 'not-a-url'],
    ['ERP_BASE_URL', 'file:///tmp/erp'], ['ERP_BASE_URL', 'not-a-url'],
  ])('rejects invalid %s protocol or URL', (name, value) => {
    expect(() => validateConfig({ ...valid, [name]: value })).toThrow(name);
  });
});
