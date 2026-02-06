'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Types
export type Role = 'scout' | 'alumni';

export interface User {
  id?: string;
  email: string;
  role: Role;
  name: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

// Mock users
const MOCK_USERS: Record<string, User> = {
  'scout@test.com': {
    email: 'scout@test.com',
    role: 'scout',
    name: 'Scout User',
  },
  'alumni@test.com': {
    email: 'alumni@test.com',
    role: 'alumni',
    name: 'Ashley Vigo',
  },
};

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('bridge_it_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        // Verify the user exists in MOCK_USERS
        if (MOCK_USERS[parsedUser.email]) {
          setUser(parsedUser);
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
        localStorage.removeItem('bridge_it_user');
      }
    }
  }, []);

  // Save user to localStorage whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('bridge_it_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('bridge_it_user');
    }
  }, [user]);

  const login = (email: string): boolean => {
    const foundUser = MOCK_USERS[email];
    if (foundUser) {
      setUser(foundUser);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
  };

  const isAuthenticated = user !== null;

  const value: AuthContextType = {
    user,
    login,
    logout,
    isAuthenticated,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// useAuth hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
