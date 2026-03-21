/**
 * API SERVICE - Axios with Interceptors
 * Base URL: same-origin (/api via Vite proxy in dev)
 * JWT Bearer token: learn_lite_token from localStorage
 * Auto-redirect to /login on 401
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const ENDPOINT_ROLE_POLICIES = [
  { prefix: '/api/admin/owner/', roles: ['SYSTEM_OWNER'] },
  { prefix: '/api/admin/finance/', roles: ['FINANCE_CONTROLLER', 'SYSTEM_OWNER'] },
  { prefix: '/api/admin/academic/', roles: ['ACADEMIC_REGISTRAR', 'SYSTEM_OWNER'] },
  { prefix: '/api/admin/ops/', roles: ['OPS_MODERATOR', 'SYSTEM_OWNER'] },
  { prefix: '/api/admin/socialmedia/', roles: ['SOCIAL_MEDIA_CONTROLLER', 'SYSTEM_OWNER'] }
];

function getDepartmentPolicy(url) {
  const normalized = String(url || '');
  return ENDPOINT_ROLE_POLICIES.find((policy) => normalized.startsWith(policy.prefix)) || null;
}

// ========================================
// AXIOS INSTANCE CONFIGURATION
// ========================================

const api = axios.create({
  baseURL: API_BASE_URL,
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
    const role = localStorage.getItem('user_role') || 'USER';

    const policy = getDepartmentPolicy(config.url);
    if (policy && !policy.roles.includes(role)) {
      return Promise.reject(new Error(`Department access denied for ${role} on ${config.url}`));
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['x-learnlite-role'] = role;
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
    const accountDisabled = error.response?.data?.code === 'ACCOUNT_DISABLED';

    if (error.response && error.response.status === 401) {
      console.warn('401 Unauthorized - clearing token and redirecting to login');
      console.warn('Error details:', error.response?.data);
      
      // Clear token and redirect to login
      localStorage.removeItem('learn_lite_token');
      localStorage.removeItem('learn_lite_user');
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_role');

      // Don't redirect for auth endpoints (login/signup/verify) — let the component handle it
      const isAuthUrl = error.config?.url?.includes('/api/auth/');
      const onAuthPage = window.location.pathname.includes('/login') || window.location.pathname.includes('/signup');

      if (!isAuthUrl && !onAuthPage) {
        window.location.href = '/login';
      }
    }

    if (accountDisabled) {
      localStorage.removeItem('learn_lite_token');
      localStorage.removeItem('learn_lite_user');
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_role');

      if (!window.location.pathname.includes('/login')) {
        alert('This account has been deactivated by SYSTEM_OWNER.');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (err, fallback = 'Request failed. Please try again.') => {
  if (!err) return fallback;

  if (!err.response && /network\s*error/i.test(String(err.message || ''))) {
    return 'Network Error: cannot reach backend API. Ensure server is running and dev proxy is active (npm run dev:all).';
  }

  return (
    err.response?.data?.error ||
    err.response?.data?.message ||
    err.message ||
    fallback
  );
};

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

  patch: async (endpoint, data = null) => {
    const response = await api.patch(endpoint, data);
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
  // Create a new group (generates unique 6-digit alphanumeric code)
  createGroup: (name) => client.post('/api/groups/create', { name }),
  
  // Join group using 6-digit code
  joinGroupByCode: (code, customBackground = null) => 
    client.post('/api/groups/join', { code, customBackground }),
  
  // Legacy methods (kept for backward compatibility)
  createGroupLegacy: (groupData) => client.post('/api/group', groupData),
  getGroupLegacy: (groupId) => client.get(`/api/group/${groupId}`),
  joinGroupLegacy: (groupId, joinCode) => client.post(`/api/group/${groupId}/join`, { joinCode }),
  leaveGroup: (groupId) => client.delete(`/api/group/${groupId}/leave`),
  
  // Workspace & management
  getMyGroups: () => client.get('/api/groups/mine'),
  getGroupWorkspace: (groupId) => client.get(`/api/groups/${groupId}`),
  updateGroupCode: (groupId, joinCode) => client.put(`/api/groups/${groupId}/code`, joinCode ? { joinCode } : {}),
  removeMember: (groupId, userId) => client.delete(`/api/groups/${groupId}/members/${userId}`),
  promoteToAdmin: (groupId, userId) => client.patch(`/api/groups/${groupId}/role`, { userId, role: 'ADMIN' }),
  setCustomBackground: (groupId, customBackground) => client.put(`/api/groups/${groupId}/background`, { customBackground })
};

export const chatAPI = {
  getMessages: (groupId) => client.get(`/api/chat/${groupId}`),
  sendMessage: (groupId, message) => client.post(`/api/chat/${groupId}`, { message })
};

export const adminAPI = {
  getUsers: () => client.get('/api/admin/users'),
  addFuelToUser: (userId) => client.post(`/api/admin/users/${userId}/add-fuel`, {}),
  getGroupActivity: () => client.get('/api/admin/group-activity'),
  getPaymentLogs: () => client.get('/api/admin/payment-logs'),
  getOwnerOverview: () => client.get('/api/admin/owner/overview'),
  getFinanceWorkplace: () => client.get('/api/admin/finance/workplace'),
  getAcademicWorkplace: () => client.get('/api/admin/academic/workplace'),
  getOpsWorkplace: () => client.get('/api/admin/ops/workplace'),
  getSocialMediaWorkplace: () => client.get('/api/admin/socialmedia/workplace'),
  getSocialMarketingFeed: () => client.get('/api/admin/socialmedia/marketing-feed'),
  getInbox: () => client.get('/api/admin/inbox'),
  sendInboxMessage: (payload) => client.post('/api/admin/inbox/send', payload),
  markInboxMessageRead: (messageId) => client.patch(`/api/admin/inbox/${messageId}/read`, {}),
  markContactRead: (contactId) => client.patch(`/api/admin/contact/${contactId}/read`, {}),
  replyToContact: (contactId, replyBody) => client.post(`/api/admin/contact/${contactId}/reply`, { replyBody }),
  createStaff: (payload) => client.post('/api/admin/create-staff', payload),
  assignRoleByEmail: (email, role) => client.post('/api/admin/assign-role', { email, role }),
  overwritePassword: (email, newPassword) => client.post('/api/admin/overwrite-password', { email, newPassword }),
  setAccountActive: (email, isActive) => client.post('/api/admin/set-active', { email, isActive })
};

export const aiAPI = {
  chat: (groupId, message) => client.post('/api/ai/chat', { groupId, message })
};

export default {
  client,
  authAPI,
  quizAPI,
  groupAPI,
  chatAPI,
  adminAPI,
  aiAPI,
  get: (endpoint) => client.get(endpoint),
  post: (endpoint, data) => client.post(endpoint, data),
  setToken: (token) => client.setToken(token),
  getToken: () => client.getToken(),
  clearToken: () => client.clearToken()
};
