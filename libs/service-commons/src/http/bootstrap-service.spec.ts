import { bootstrapService } from './bootstrap-service';

describe('bootstrapService', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('does not log or exit when bootstrap resolves', async () => {
    bootstrapService(() => Promise.resolve());
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('logs and exits(1) when bootstrap rejects', async () => {
    const err = new Error('startup failed');
    bootstrapService(() => Promise.reject(err));
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Fatal error during startup:', err);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
