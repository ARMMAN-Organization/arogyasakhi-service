import { SignJWT, importPKCS8, importSPKI, jwtVerify, type CryptoKey, type JWTPayload } from 'jose';

/**
 * Signs and verifies access tokens. Backed by a local RS256 keypair today;
 * swap the implementation for AWS KMS (asymmetric CMK, sign/verify API) later
 * without changing any call site — callers only depend on this interface.
 */
export interface TokenSigner {
  sign(payload: JWTPayload, expiresIn: string): Promise<string>;
  verify(token: string): Promise<JWTPayload>;
}

/** RS256 signer backed by a PEM keypair supplied via environment variables. */
export class LocalKeypairTokenSigner implements TokenSigner {
  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly publicKey: CryptoKey,
  ) {}

  static async create(
    privateKeyPem: string,
    publicKeyPem: string,
  ): Promise<LocalKeypairTokenSigner> {
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    return new LocalKeypairTokenSigner(privateKey, publicKey);
  }

  async sign(payload: JWTPayload, expiresIn: string): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.privateKey);
  }

  async verify(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.publicKey);
    return payload;
  }
}

/**
 * Verify-only signer for services that only need to check tokens (e.g. the
 * API Gateway), never issue them. Distributing only the public key means a
 * compromised verify-only service can never forge a token.
 */
export class PublicKeyVerifier implements Pick<TokenSigner, 'verify'> {
  private constructor(private readonly publicKey: CryptoKey) {}

  static async create(publicKeyPem: string): Promise<PublicKeyVerifier> {
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    return new PublicKeyVerifier(publicKey);
  }

  async verify(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.publicKey);
    return payload;
  }
}
