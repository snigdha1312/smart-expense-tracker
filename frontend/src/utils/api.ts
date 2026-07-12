import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onTokenRefreshedCallback: ((accessToken: string) => void) | null = null;

export const setTokens = (acc: string | null, ref: string | null) => {
  accessToken = acc;
  refreshToken = ref;
};

export const setOnTokenRefreshed = (callback: (accessToken: string) => void) => {
  onTokenRefreshedCallback = callback;
};

// Request interceptor to inject JWT
api.interceptors.request.use(
  (config) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle auto-refresh on 401
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Avoid infinite loop if refresh endpoint itself returns 401
    if (originalRequest.url?.includes('/api/auth/refresh/')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      if (!refreshToken) {
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_URL}/api/auth/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = response.data.access;
        
        // Update in-memory token state
        setTokens(newAccessToken, refreshToken);
        
        // Notify React Context to update state
        if (onTokenRefreshedCallback) {
          onTokenRefreshedCallback(newAccessToken);
        }

        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        
        // If refresh fails, clear tokens
        setTokens(null, null);
        if (onTokenRefreshedCallback) {
          onTokenRefreshedCallback('');
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
