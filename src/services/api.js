/**
 * API SERVICE - Axios with Interceptors
 * Base URL: http://localhost:4000
 * JWT Bearer token: learn_lite_token from localStorage
 * Auto-redirect to /login on 401
 */

import axios from 'axios';

// ========================================
// AXIOS INSTANCE CONFIGURATION
// ========================================

const api = axios.create({
  baseURL: 'http://localhost:4000',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// ========================================
// REQUEST INTERCEPTOR - Add Bearer Token
// ========================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('learn_lite_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ========================================
// RESPONSE INTERCEPTOR - Handle 401
// ========================================

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn('401 Unauthorized - clearing token and redirecting to login');
      console.warn('Error details:', error.response?.data);
      
      // Clear token and redirect to login
      localStorage.removeItem('learn_lite_token');
      
      // Only redirect if not already on login/signup page
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ========================================
// HELPER FUNCTIONS
// ========================================

const client = {
  setToken: (token) => {
    if (token) {
      localStorage.setItem('learn_lite_token', token);
    }
  },

  getToken: () => {
    return localStorage.getItem('learn_lite_token');
  },

  clearToken: () => {
    localStorage.removeItem('learn_lite_token');
  },

  get: async (endpoint) => {
    const response = await api.get(endpoint);
    return response.data;
  },

  post: async (endpoint, data = null) => {
    const response = await api.post(endpoint, data);
    return response.data;
  },

  put: async (endpoint, data = null) => {
    const response = await api.put(endpoint, data);
    return response.data;
  },

  delete: async (endpoint) => {
    const response = await api.delete(endpoint);
    return response.data;
  },

  postForm: async (endpoint, formData) => {
    const response = await api.post(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }
};

// ========================================
// API ENDPOINTS
// ========================================

export const authAPI = {
  login: async (email, password) => {
    const result = await client.post('/api/auth/login', { email, password });
    if (result.token) client.setToken(result.token);
    return result;
  },
  register: async (userData) => {
    const result = await client.post('/api/auth/signup', userData);
    if (result.token) client.setToken(result.token);
    return result;
  },
  logout: () => {
    client.clearToken();
    return client.post('/api/auth/logout');
  },
  verify: () => client.post('/api/auth/verify')
};

export const quizAPI = {
  generateQuiz: async (file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    Object.keys(options).forEach((key) => formData.append(key, options[key]));
    return client.postForm('/api/quiz/generate', formData);
  },
  getQuiz: (quizId) => client.get(`/api/quiz/${quizId}`),
  listQuizzes: () => client.get('/api/quiz/list'),
  submitAttempt: (quizId, answers) => client.post(`/api/quiz/${quizId}/attempt`, { answers }),
  deleteQuiz: (quizId) => client.delete(`/api/quiz/${quizId}`)
};

export const groupAPI = {
  createGroup: (groupData) => client.post('/api/group', groupData),
  getGroup: (groupId) => client.get(`/api/group/${groupId}`),
  joinGroup: (groupId, joinCode) => client.post(`/api/group/${groupId}/join`, { joinCode }),
  leaveGroup: (groupId) => client.delete(`/api/group/${groupId}/leave`)
};

export const chatAPI = {
  getMessages: (groupId) => client.get(`/api/chat/${groupId}`),
  sendMessage: (groupId, message) => client.post(`/api/chat/${groupId}`, { message })
};

export const adminAPI = {
  getUsers: () => client.get('/api/admin/users'),
  addFuelToUser: (userId) => client.post(`/api/admin/users/${userId}/add-fuel`, {})
};

export default {
  client,
  authAPI,
  quizAPI,
  groupAPI,
  chatAPI,
  adminAPI,
  get: (endpoint) => client.get(endpoint),
  post: (endpoint, data) => client.post(endpoint, data),
  setToken: (token) => client.setToken(token),
  getToken: () => client.getToken(),
  clearToken: () => client.clearToken()
};
