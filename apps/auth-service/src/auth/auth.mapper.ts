import { decryptPii } from '@armman/service-commons';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, from now. Null — this access token has no `exp` claim and never expires by time; only /auth/logout or revocation ends the session. */
  expiresIn: number | null;
  /** Every role code the caller holds — same set encoded in the access token's `roles` claim. */
  roles: string[];
  /** The primary role assignment's project/geography scope (first assignment; see issueTokens). */
  projectId: string | null;
  geographyUnitId: string | null;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  mobileNumber: string;
  email: string | null;
  status: string;
  createdAt: Date;
  roles: { roleCode: string; projectId: string | null; geographyUnitId: string | null }[];
  /** The primary role's project name, or null if that role has no project (e.g. ADMIN). */
  projectName: string | null;
  /** Sakhi profile's employee_code — only present for SAKHI-role users. */
  cardNumber: string | null;
  /** Last 4 digits of the Sakhi's bank account, masked (e.g. "••••1234") — never the full number. */
  maskedBankAccount: string | null;
  /** Sakhi profile's supervisor_id — per SRS's Sakhi identity field list; only present for SAKHI-role users. */
  supervisorId: string | null;
}

export interface CreatedUser {
  id: string;
  username: string;
  mobileNumber: string;
  displayName: string;
  email: string | null;
  status: string;
  createdAt: Date;
}

const BANK_ACCOUNT_VISIBLE_DIGITS = 4;
const BANK_ACCOUNT_MASK = '••••';

/** Masks a decrypted bank account number down to its last 4 digits. */
export function maskBankAccount(accountNumber: string): string {
  const lastDigits = accountNumber.slice(-BANK_ACCOUNT_VISIBLE_DIGITS);
  return `${BANK_ACCOUNT_MASK}${lastDigits}`;
}

/** Shape of the user row `findUserByIdWithProfile` returns, structurally typed
 * so this mapper isn't coupled to the Prisma client type. */
export interface UserProfileRow {
  id: string;
  username: string;
  displayName: string;
  mobileNumber: string;
  email: string | null;
  status: string;
  createdAt: Date;
  userRoles: {
    role: { roleCode: string };
    projectId: string | null;
    geographyUnitId: string | null;
    project?: { projectName: string } | null;
  }[];
  sakhiProfile: {
    isDeleted: boolean;
    employeeCode: string | null;
    bankAccountToken: Buffer | null;
    supervisorId: string | null;
  } | null;
}

/** Projects a user-with-profile row to the API `UserProfile`, decrypting and
 * masking the bank account and flattening the primary role's project name. */
export function toUserProfile(user: UserProfileRow): UserProfile {
  const [primaryRole] = user.userRoles;
  const profile = user.sakhiProfile && !user.sakhiProfile.isDeleted ? user.sakhiProfile : null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    mobileNumber: user.mobileNumber,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
    roles: user.userRoles.map((ur) => ({
      roleCode: ur.role.roleCode,
      projectId: ur.projectId,
      geographyUnitId: ur.geographyUnitId,
    })),
    projectName: primaryRole?.project?.projectName ?? null,
    cardNumber: profile?.employeeCode ?? null,
    maskedBankAccount: profile?.bankAccountToken
      ? maskBankAccount(decryptPii(profile.bankAccountToken))
      : null,
    supervisorId: profile?.supervisorId ?? null,
  };
}
