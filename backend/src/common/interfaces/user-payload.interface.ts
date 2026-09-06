export enum UserRole {
  RECIPIENT = 'RECIPIENT',
  COURIER = 'COURIER',
  HUB_OWNER = 'HUB_OWNER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export interface UserPayload {
  sub: string;
  phone: string;
  role: UserRole;
  is_verified: boolean;
}
