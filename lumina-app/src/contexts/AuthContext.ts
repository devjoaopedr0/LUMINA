import { createContext, useContext } from 'react';
import type { ApiUser, UpdateProfilePayload } from '@/lib/api';

export interface SignupData {
  institution?: { name: string; email: string; phone?: string };
  accountType?: 'STUDENT_INDEPENDENT' | 'TEACHER';
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  teacherSubject?: string;
}

export interface AuthContextValue {
  user: ApiUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<ApiUser>;
  signup: (data: SignupData) => Promise<ApiUser>;
  setPassword: (password: string) => Promise<ApiUser>;
  verifyEmail: (code: string) => Promise<ApiUser>;
  resendVerification: () => Promise<void>;
  updateProfile: (data: UpdateProfilePayload) => Promise<ApiUser>;
  logout: () => void;
  logoutAll: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return ctx;
}
