export interface UserProfile {
  uid: string;
  email: string;
  username?: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
  courses?: string[];
  studyPlace?: string;
  age?: number;
  studyProgress?: string;
  role?: 'admin' | 'user';
  isBanned?: boolean;
}

export interface PublicResource {
  id: string;
  title: string;
  description?: string;
  type: 'note' | 'video';
  url?: string; // For videos
  content?: string; // For notes
  subject: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  likes: number;
  views: number;
}

export interface StudySession {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  status: 'planned' | 'completed' | 'skipped';
  noteId?: string;
}

export interface Friendship {
  id: string;
  users: string[];
  status: 'pending' | 'accepted';
  createdAt: string;
  requesterId: string;
}

export interface Note {
  id: string;
  title: string;
  content?: string;
  subject?: string;
  lastModified: string;
  type: 'document' | 'canvas';
  sharedWith?: string[];
  ownerId: string;
  ownerName?: string;
}

export interface CanvasElement {
  id: string;
  type: 'text' | 'sticky' | 'rect' | 'circle';
  x: number;
  y: number;
  text?: string;
  color?: string;
  width?: number;
  height?: number;
  rotation?: number;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
