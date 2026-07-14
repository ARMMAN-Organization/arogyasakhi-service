import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import { LocalKeypairTokenSigner } from './token-signer';

describe('LocalKeypairTokenSigner', () => {
  let signer: LocalKeypairTokenSigner;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const privateKeyPem = await exportPKCS8(privateKey);
    const publicKeyPem = await exportSPKI(publicKey);
    signer = await LocalKeypairTokenSigner.create(privateKeyPem, publicKeyPem);
  });

  it('signs a payload and verifies it back to the original claims', async () => {
    const token = await signer.sign({ sub: 'user-1', roles: ['SAKHI'] }, '15m');
    const payload = await signer.verify(token);

    expect(payload.sub).toBe('user-1');
    expect(payload.roles).toEqual(['SAKHI']);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
  });

  it('rejects a token signed by a different keypair', async () => {
    const { privateKey: otherPrivateKey, publicKey: otherPublicKey } = await generateKeyPair(
      'RS256',
      {
        extractable: true,
      },
    );
    const otherSigner = await LocalKeypairTokenSigner.create(
      await exportPKCS8(otherPrivateKey),
      await exportSPKI(otherPublicKey),
    );
    const token = await otherSigner.sign({ sub: 'user-1' }, '15m');

    await expect(signer.verify(token)).rejects.toThrow();
  });

  it('rejects a malformed token string', async () => {
    await expect(signer.verify('not-a-jwt')).rejects.toThrow();
  });

  it('rejects an already-expired token', async () => {
    const token = await signer.sign({ sub: 'user-1' }, '-1s');
    await expect(signer.verify(token)).rejects.toThrow();
  });
});
