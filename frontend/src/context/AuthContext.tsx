import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setTokens, setOnTokenRefreshed } from '../utils/api';

export interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Connect Axios interceptor to React AuthContext state updates
  useEffect(() => {
    setOnTokenRefreshed((newToken: string) => {
      setAccessTokenState(newToken);
      if (!newToken) {
        setUser(null);
      } else {
        // Retrieve profile data using the new token
        api.get('/api/auth/me/')
          .then((res) => setUser(res.data))
          .catch(() => {
            setUser(null);
            setAccessTokenState(null);
            setTokens(null, null);
          });
      }
    });
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post('/api/auth/login/', {
        username: email.toLowerCase(),
        password,
      });

      const { access, refresh } = response.data;
      setTokens(access, refresh);
      setAccessTokenState(access);

      // Retrieve and store profile
      const userResponse = await api.get('/api/auth/me/');
      setUser(userResponse.data);
    } catch (error) {
      logout();
      throw error;
    }
  };

  const register = async (email: string, password: string, name: string) => {
    // Call registration endpoint
    await api.post('/api/auth/register/', {
      email,
      password,
      name,
    });
    // Autologin after registration
    await login(email, password);
  };

  const logout = () => {
    setTokens(null, null);
    setAccessTokenState(null);
    setUser(null);
  };

  useEffect(() => {
    // End loading state immediately since in-memory tokens start clean
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
