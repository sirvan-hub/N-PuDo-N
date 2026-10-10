import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ParcelEntity } from '../../database/entities/parcel.entity';
import { HubEntity } from '../../database/entities/hub.entity';
import { NetworkEntryChargeEntity } from '../../database/entities/network-entry-charge.entity';
import { CustodyTransferEntity } from '../../database/entities/custody-transfer.entity';
import { UserPayload, UserRole } from '../../common/interfaces/user-payload.interface';

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const SIGNED_EVIDENCE_URL_TTL_SECONDS = 60;

export enum EvidenceCategory {
  ENTRY_FEE_RECEIPT = 'ENTRY_FEE_RECEIPT',
  COURIER_HANDOVER = 'COURIER_HANDOVER',
  HUB_RECEIPT = 'HUB_RECEIPT',
  HUB_RELEASE = 'HUB_RELEASE',
  RECIPIENT_HANDOVER = 'RECIPIENT_HANDOVER',
}

type UploadedImage = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class EvidenceStorageService {
  constructor(
    @InjectRepository(ParcelEntity) private readonly parcels: Repository<ParcelEntity>,
    @InjectRepository(HubEntity) private readonly hubs: Repository<HubEntity>,
    @InjectRepository(NetworkEntryChargeEntity) private readonly entryCharges: Repository<NetworkEntryChargeEntity>,
    @InjectRepository(CustodyTransferEntity) private readonly transfers: Repository<CustodyTransferEntity>,
  ) {}

  async upload(parcelId: string, category: EvidenceCategory, file: UploadedImage, actor: UserPayload) {
    const parcel = await this.getAuthorizedParcel(parcelId, actor);
    this.assertCategoryRole(category, actor.role);
    const extension = this.validateImage(file);
    const path = `parcels/${parcel.id}/${category.toLowerCase()}/${randomUUID()}.${extension}`;
    await this.storageRequest(`object/${this.bucket()}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': file.mimetype,
        'x-upsert': 'false',
      },
      body: file.buffer,
    });
    return {
      evidence_ref: `pudo-evidence://${path}`,
      category,
      content_type: file.mimetype,
      size_bytes: file.size,
    };
  }

  async createSignedUrl(parcelId: string, evidenceRef: string, actor: UserPayload) {
    const parcel = await this.getAuthorizedParcel(parcelId, actor);
    const path = this.parseReference(evidenceRef, parcel.id);
    if (!(await this.isAttachedEvidence(parcel.id, evidenceRef))) {
      throw new NotFoundException('Evidence is not attached to this parcel');
    }
    const response = await this.storageRequest(`object/sign/${this.bucket()}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: SIGNED_EVIDENCE_URL_TTL_SECONDS }),
    }) as { signedURL?: string };
    if (!response?.signedURL || typeof response.signedURL !== 'string') {
      throw new ServiceUnavailableException('Storage provider did not return a signed URL');
    }
    const baseUrl = this.storageBaseUrl();
    const signedUrl = response.signedURL.startsWith('http')
      ? response.signedURL
      : `${baseUrl}/storage/v1${response.signedURL.startsWith('/') ? '' : '/'}${response.signedURL}`;
    return { signed_url: signedUrl, expires_in_seconds: SIGNED_EVIDENCE_URL_TTL_SECONDS };
  }

  private async getAuthorizedParcel(parcelId: string, actor: UserPayload): Promise<ParcelEntity> {
    if (!actor?.sub || !actor.role) throw new UnauthorizedException();
    const parcel = await this.parcels.findOne({ where: { id: parcelId } });
    if (!parcel) throw new NotFoundException('Parcel not found');

    const isAdmin = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    const isCourier = actor.role === UserRole.COURIER && parcel.courier_id === actor.sub;
    const isRecipient = actor.role === UserRole.RECIPIENT &&
      (parcel.recipient_id === actor.sub || parcel.recipient_phone === actor.phone);
    const hubId = parcel.current_hub_id || parcel.proposed_hub_id;
    const isHubOwner = actor.role === UserRole.HUB_OWNER && Boolean(hubId) &&
      Boolean(await this.hubs.findOne({ where: { id: hubId, owner_id: actor.sub } }));
    if (!isAdmin && !isCourier && !isRecipient && !isHubOwner) {
      throw new ForbiddenException('You do not have access to this parcel evidence');
    }
    return parcel;
  }

  private assertCategoryRole(category: EvidenceCategory, role: UserRole) {
    const allowedRoles: Record<EvidenceCategory, UserRole> = {
      [EvidenceCategory.ENTRY_FEE_RECEIPT]: UserRole.RECIPIENT,
      [EvidenceCategory.COURIER_HANDOVER]: UserRole.COURIER,
      [EvidenceCategory.HUB_RECEIPT]: UserRole.HUB_OWNER,
      [EvidenceCategory.HUB_RELEASE]: UserRole.HUB_OWNER,
      [EvidenceCategory.RECIPIENT_HANDOVER]: UserRole.RECIPIENT,
    };
    if (!Object.values(EvidenceCategory).includes(category)) {
      throw new BadRequestException('Unsupported evidence category');
    }
    if (role !== allowedRoles[category]) {
      throw new ForbiddenException('This role cannot upload evidence for the requested step');
    }
  }

  private validateImage(file: UploadedImage): string {
    if (!file || !Buffer.isBuffer(file.buffer) || file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) {
      throw new BadRequestException('Image must be between 1 byte and 10 MB');
    }
    if (!Object.hasOwn(MIME_EXTENSIONS, file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP images are accepted');
    }
    const bytes = file.buffer;
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP';
    const matches = (file.mimetype === 'image/jpeg' && isJpeg) ||
      (file.mimetype === 'image/png' && isPng) ||
      (file.mimetype === 'image/webp' && isWebp);
    if (!matches) throw new BadRequestException('Image content does not match its declared MIME type');
    return MIME_EXTENSIONS[file.mimetype];
  }

  private async isAttachedEvidence(parcelId: string, reference: string): Promise<boolean> {
    const parcel = await this.parcels.findOne({ where: { id: parcelId } });
    if (!parcel) return false;
    if ([parcel.label_image_ref, parcel.courier_handover_evidence_ref, parcel.hub_receipt_evidence_ref].includes(reference)) {
      return true;
    }
    const charge = await this.entryCharges.findOne({ where: { parcel_id: parcelId } });
    if (charge?.receipt_evidence_ref === reference) return true;
    const transfers = await this.transfers.find({ where: { parcel_id: parcelId } });
    return transfers.some((transfer) =>
      transfer.hub_handover_evidence_ref === reference || transfer.recipient_handover_evidence_ref === reference,
    );
  }

  private parseReference(reference: string, parcelId: string): string {
    const prefix = `pudo-evidence://parcels/${parcelId}/`;
    if (typeof reference !== 'string' || !reference.startsWith(prefix)) {
      throw new BadRequestException('Invalid private evidence reference');
    }
    const path = reference.slice('pudo-evidence://'.length);
    if (path.includes('..') || path.includes('\\') || path.includes('?') || path.includes('#')) {
      throw new BadRequestException('Invalid private evidence reference');
    }
    return path;
  }

  private bucket(): string {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    if (!bucket || !/^[a-z0-9][a-z0-9_-]{1,62}$/.test(bucket)) {
      throw new ServiceUnavailableException('Private evidence storage is not configured');
    }
    return bucket;
  }

  private storageBaseUrl(): string {
    const value = process.env.SUPABASE_URL;
    if (!value) throw new ServiceUnavailableException('Private evidence storage is not configured');
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error('HTTPS is required');
      }
      return url.origin;
    } catch {
      throw new ServiceUnavailableException('SUPABASE_URL must be a valid HTTPS URL');
    }
  }

  private async storageRequest(path: string, init: RequestInit): Promise<any> {
    const baseUrl = this.storageBaseUrl();
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new ServiceUnavailableException('Private evidence storage credentials are not configured');
    const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/storage/v1/${encodedPath}`, {
        ...init,
        signal: AbortSignal.timeout(10_000),
        headers: {
          apikey: secret,
          Authorization: `Bearer ${secret}`,
          ...init.headers,
        },
      });
    } catch {
      throw new ServiceUnavailableException('Private evidence storage is temporarily unavailable');
    }
    if (!response.ok) {
      if (response.status === 404) throw new NotFoundException('Stored evidence was not found');
      if (response.status === 400 || response.status === 413 || response.status === 415) {
        throw new BadRequestException('Storage provider rejected the evidence request');
      }
      throw new ServiceUnavailableException(`Private evidence storage returned HTTP ${response.status}`);
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();
    return null;
  }
}
