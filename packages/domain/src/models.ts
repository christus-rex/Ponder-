/**
 * Shared identifiers and durable status values used across the provider-neutral
 * domain package. Product-specific state belongs in the focused modules
 * (matching, Room Brain, media, onboarding) rather than in a parallel demo
 * schema.
 */
export type UserId = string;
export type RoomId = string;
export type CorrelationId = string;

export type AccountStatus = 'active' | 'limited' | 'suspended' | 'closed';
export type RoomStatus = 'open' | 'closed' | 'archived';
export type ConnectionStatus = 'pending' | 'accepted' | 'blocked';
