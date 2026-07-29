import { withApiPrefix } from './docs.controller';

describe('withApiPrefix', () => {
  it('appends /api/v1 to a bare base URL', () => {
    expect(withApiPrefix('https://api.armman.org')).toBe('https://api.armman.org/api/v1');
  });

  it('does not double the suffix when it is already present', () => {
    expect(withApiPrefix('https://api.armman.org/api/v1')).toBe('https://api.armman.org/api/v1');
  });

  it('strips a trailing slash before appending', () => {
    expect(withApiPrefix('https://api.armman.org/')).toBe('https://api.armman.org/api/v1');
  });

  it('strips a trailing slash when the suffix is already present', () => {
    expect(withApiPrefix('https://api.armman.org/api/v1/')).toBe('https://api.armman.org/api/v1');
  });
});
