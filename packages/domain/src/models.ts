export type UserId = string;
export type WorldId = string;
export type RoomId = string;
export type CorrelationId = string;

export type AccountStatus = 'active' | 'limited' | 'suspended' | 'closed';
export type WorldVisibility = 'public' | 'members' | 'private';
export type RoomStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type ParticipantRole = 'host' | 'moderator' | 'speaker' | 'viewer';
export type ContentRating = 'mature' | 'after_dark';

export interface PublicProfile {
  userId: UserId;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface CreatorProfile {
  userId: UserId;
  headline: string | null;
  category: string | null;
  isCreator: boolean;
}

export interface World {
  id: WorldId;
  ownerUserId: UserId;
  name: string;
  slug: string;
  description: string | null;
  visibility: WorldVisibility;
  contentRating: ContentRating;
  publishedAt: string | null;
}

export interface LiveRoom {
  id: RoomId;
  worldId: WorldId;
  hostUserId: UserId;
  title: string;
  status: RoomStatus;
  contentRating: ContentRating;
  providerRoomId: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface GiftCatalogItem {
  id: string;
  sku: string;
  name: string;
  amount: number;
  currency: 'PONDER_DEMO';
  active: boolean;
}

export type LedgerDirection = 'credit' | 'debit';
export type LedgerLeg = 'sender_debit' | 'creator_credit' | 'adjustment';

export interface LedgerEntry {
  id: string;
  accountUserId: UserId;
  correlationId: CorrelationId;
  leg: LedgerLeg;
  direction: LedgerDirection;
  amount: number;
  currency: 'PONDER_DEMO';
  reason: 'gift' | 'grant' | 'reversal' | 'adjustment';
  occurredAt: string;
}

export interface GiftEvent {
  id: string;
  correlationId: CorrelationId;
  roomId: RoomId;
  giftCatalogItemId: string;
  senderUserId: UserId;
  creatorUserId: UserId;
  amount: number;
  currency: 'PONDER_DEMO';
  occurredAt: string;
}

export type ReportReason = 'harassment' | 'hate' | 'sexual_content' | 'violence' | 'spam' | 'impersonation' | 'underage_concern' | 'other';

export interface ModerationReport {
  id: string;
  reporterUserId: UserId;
  targetUserId: UserId | null;
  roomId: RoomId | null;
  reason: ReportReason;
  details: string | null;
  status: 'open' | 'triaged' | 'resolved' | 'dismissed';
  createdAt: string;
}
