/**
 * API SERVICE - Axios with Interceptors
 * Base URL: same-origin (/api via Vite proxy in dev)
 * JWT Bearer token: learn_lite_token from localStorage
 * Auto-redirect to /login on 401
 */

import axios from 'axios';

const RAW_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '');

function normalizePath(pathname) {
  const value = String(pathname || '');
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.replace(/\/+$/, '');
}

function normalizeEndpoint(endpoint) {
  const normalizedEndpoint = normalizePath(endpoint);
  const baseHasApiSuffix = /\/api$/i.test(API_BASE_URL);

  if (baseHasApiSuffix && normalizedEndpoint.startsWith('/api/')) {
    return normalizedEndpoint.replace(/^\/api/i, '');
  }

  return normalizedEndpoint;
}

const ENDPOINT_ROLE_POLICIES = [
  { prefix: '/admin/owner/', roles: ['SYSTEM_OWNER', 'ROOT_ADMIN'] },
  { prefix: '/admin/finance/', roles: ['FINANCE_CONTROLLER', 'SYSTEM_OWNER', 'ROOT_ADMIN'] },
  { prefix: '/admin/academic/', roles: ['ACADEMIC_REGISTRAR', 'SYSTEM_OWNER', 'ROOT_ADMIN'] },
  { prefix: '/admin/ops/', roles: ['OPS_MODERATOR', 'SYSTEM_OWNER', 'ROOT_ADMIN'] },
  { prefix: '/admin/socialmedia/', roles: ['SOCIAL_MEDIA_CONTROLLER', 'SYSTEM_OWNER', 'ROOT_ADMIN'] }
];

function getDepartmentPolicy(url) {
  const normalized = normalizeEndpoint(url).replace(/^\/api(?=\/|$)/i, '');
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
      const isAuthUrl = normalizeEndpoint(error.config?.url || '').includes('/auth/');
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

  if (err.response?.status === 429) {
    const retryAfterHeader = Number(err.response?.headers?.['retry-after'] || err.response?.headers?.['Retry-After'] || 0);
    const retryAfterSeconds = Number(err.response?.data?.retryAfterSeconds || retryAfterHeader || 0);

    if (retryAfterSeconds > 0) {
      return `Too many requests. Please wait ${retryAfterSeconds} seconds and try again.`;
    }

    return 'Too many requests. Please wait a short time before trying again.';
  }

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

  get: async (endpoint, config = {}) => {
    const response = await api.get(normalizeEndpoint(endpoint), config);
    return response.data;
  },

  post: async (endpoint, data = null) => {
    const response = await api.post(normalizeEndpoint(endpoint), data);
    return response.data;
  },

  put: async (endpoint, data = null) => {
    const response = await api.put(normalizeEndpoint(endpoint), data);
    return response.data;
  },

  patch: async (endpoint, data = null) => {
    const response = await api.patch(normalizeEndpoint(endpoint), data);
    return response.data;
  },

  delete: async (endpoint) => {
    const response = await api.delete(normalizeEndpoint(endpoint));
    return response.data;
  },

  postForm: async (endpoint, formData) => {
    const response = await api.post(normalizeEndpoint(endpoint), formData, {
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
  verify: () => client.post('/api/auth/verify'),
  requestPasswordResetOtp: (email) => client.post('/api/auth/forgot-password/request', { email }),
  verifyPasswordResetOtp: (email, otp) => client.post('/api/auth/forgot-password/verify', { email, otp }),
  resetPasswordWithOtp: (payload) => client.post('/api/auth/forgot-password/reset', payload),
  updateProfile: (payload) => client.put('/api/profile', payload)
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
  setCustomBackground: (groupId, customBackground) => client.put(`/api/groups/${groupId}/background`, { customBackground }),
  publishQuiz: (groupId, payload) => client.post(`/api/groups/${groupId}/publish-quiz`, payload)
};

export const userAPI = {
  getFuel: () => client.get('/api/user/fuel', { params: { t: Date.now() } })
};

export const publicAPI = {
  getHomeMedia: () => client.get('/api/home-media')
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
  getAuditLogs: (page = 1, limit = 50, filterAction = null) => {
    const params = { page, limit };
    if (filterAction) params.action = filterAction;
    return client.get('/api/admin/owner/audit-logs', { params });
  },
  getFinanceWorkplace: () => client.get('/api/admin/finance/workplace'),
  createAllocationRequest: (payload) => client.post('/api/admin/finance/allocation-requests', payload),
  getProposedDisbursements: () => client.get('/api/admin/finance/proposed-disbursements'),
  exportFinanceActivityCsv: () => client.get('/api/admin/finance/activity-export.csv'),
  exportFinanceActivityPdf: () => client.get('/api/admin/finance/activity-export.pdf'),
  getAcademicWorkplace: () => client.get('/api/admin/academic/workplace'),
  bulkUploadAcademicQuestions: (rows) => client.post('/api/admin/academic/questions/bulk-upload', { rows }),
  getOpsWorkplace: () => client.get('/api/admin/ops/workplace'),
  getOpsActiveUserLogins: (params = {}) => client.get('/api/admin/ops/active-users-logins', { params }),
  setUserSuspended: (userId, suspended) => client.patch(`/api/admin/ops/users/${userId}/suspension`, { suspended }),
  uploadHomeMedia: (payload) => client.post('/api/admin/ops/home-media', payload),
  getHomeMedia: () => client.get('/api/home-media'),
  getSocialMediaWorkplace: () => client.get('/api/admin/socialmedia/workplace'),
  getSocialMarketingFeed: () => client.get('/api/admin/socialmedia/marketing-feed'),
  getSocialHighScoreKit: () => client.get('/api/admin/socialmedia/high-score-kit'),
  getInbox: () => client.get('/api/admin/inbox'),
  sendInboxMessage: (payload) => client.post('/api/admin/inbox/send', payload),
  markInboxMessageRead: (messageId) => client.patch(`/api/admin/inbox/${messageId}/read`, {}),
  markContactRead: (contactId) => client.patch(`/api/admin/contact/${contactId}/read`, {}),
  replyToContact: (contactId, replyBody) => client.post(`/api/admin/contact/${contactId}/reply`, { replyBody }),
  createStaff: (payload) => client.post('/api/admin/create-staff', payload),
  assignRoleByEmail: (email, role) => client.post('/api/admin/assign-role', { email, role }),
  overwritePassword: (email, newPassword) => client.post('/api/admin/overwrite-password', { email, newPassword }),
  setAccountActive: (email, isActive) => client.post('/api/admin/set-active', { email, isActive }),
  rootKillSwitch: (targetUserId, reason) => client.post('/api/root/kill-switch', { targetUserId, reason }),
  rootRoleEscalator: (targetUserId, newRole, reason) => client.post('/api/root/role-escalator', { targetUserId, newRole, reason }),
  rootDatabaseSnapshot: () => client.post('/api/root/database-snapshot', {}),
  getRootMissionControl: () => client.get('/api/root/mission-control'),
  approveProposedDisbursement: (proposalId) => client.post(`/api/root/proposed-disbursements/${proposalId}/approve`, {}),
  getRootGodView: () => client.get('/api/root/god-view'),
  getRootSensitiveAudit: (page = 1, limit = 100) => client.get('/api/root/audit/sensitive', { params: { page, limit } }),
  setRootGlobalOverrides: (payload) => client.put('/api/root/settings/overrides', payload)
};

export const aiAPI = {
  chat: (groupId, message) => client.post('/api/ai/chat', { groupId, message })
};

export default {
  client,
  authAPI,
  quizAPI,
  groupAPI,
  userAPI,
  publicAPI,
  chatAPI,
  adminAPI,
  aiAPI,
  get: (endpoint, config) => client.get(endpoint, config),
  post: (endpoint, data) => client.post(endpoint, data),
  setToken: (token) => client.setToken(token),
  getToken: () => client.getToken(),
  clearToken: () => client.clearToken()
};
