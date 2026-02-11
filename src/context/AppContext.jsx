import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

// ========================================
// INDEXEDDB STORAGE - Complete migration from storage.js
// ========================================

const DB_NAME = 'learnlite_local';
const DB_VERSION = 1;

class LocalStorage {
  constructor() {
    this.db = null;
    this.ready = this.initDB();
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      // Create object stores when database is first created
      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store for quiz attempts
        if (!db.objectStoreNames.contains('quizAttempts')) {
          db.createObjectStore('quizAttempts', { keyPath: 'id', autoIncrement: true });
        }

        // Store for chat messages
        if (!db.objectStoreNames.contains('chatMessages')) {
          const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id', autoIncrement: true });
          chatStore.createIndex('groupId', 'groupId');
          chatStore.createIndex('timestamp', 'timestamp');
        }

        // Store for uploaded notes
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  // Save a quiz attempt locally
  async saveQuizAttempt(quizData) {
    await this.ready;
    const store = this.db.transaction('quizAttempts', 'readwrite').objectStore('quizAttempts');
    quizData.timestamp = Date.now();
    quizData.synced = false;
    return new Promise((resolve, reject) => {
      const request = store.add(quizData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Save a chat message locally
  async saveChatMessage(message) {
    await this.ready;
    const store = this.db.transaction('chatMessages', 'readwrite').objectStore('chatMessages');
    message.timestamp = Date.now();
    message.synced = false;
    return new Promise((resolve, reject) => {
      const request = store.add(message);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Save uploaded notes locally
  async saveNote(noteData) {
    await this.ready;
    const store = this.db.transaction('notes', 'readwrite').objectStore('notes');
    noteData.timestamp = Date.now();
    noteData.synced = false;
    return new Promise((resolve, reject) => {
      const request = store.add(noteData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all quiz attempts
  async getQuizAttempts() {
    await this.ready;
    const store = this.db.transaction('quizAttempts', 'readonly').objectStore('quizAttempts');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get chat messages for a specific group
  async getChatMessages(groupId) {
    await this.ready;
    const store = this.db.transaction('chatMessages', 'readonly').objectStore('chatMessages');
    const index = store.index('groupId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(groupId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all notes
  async getNotes() {
    await this.ready;
    const store = this.db.transaction('notes', 'readonly').objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get storage usage stats
  async getStorageStats() {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        percentUsed: (estimate.usage / estimate.quota) * 100
      };
    }
    return null;
  }

  // Backup unsynced data to server
  async backupToServer(serverUrl, token) {
    await this.ready;
    const unsyncedQuizzes = await this.getUnsyncedData('quizAttempts');
    const unsyncedMessages = await this.getUnsyncedData('chatMessages');
    const unsyncedNotes = await this.getUnsyncedData('notes');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const summarize = (arr) => {
        if (!arr || !Array.isArray(arr)) return null;
        return arr.map((item) => ({
          id: item.id || null,
          timestamp: item.timestamp || null,
          approxBytes: estimateBytes(item)
        }));
      };

      const payload = {
        quizzesMeta: summarize(unsyncedQuizzes),
        messagesMeta: summarize(unsyncedMessages),
        notesMeta: summarize(unsyncedNotes)
      };

      const response = await fetch(serverUrl.replace(/\/$/, '') + '/api/backup', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        await this.markAsSynced('quizAttempts', unsyncedQuizzes);
        await this.markAsSynced('chatMessages', unsyncedMessages);
        await this.markAsSynced('notes', unsyncedNotes);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Backup failed:', error);
      return false;
    }
  }

  // Get unsynced items from a store
  async getUnsyncedData(storeName) {
    await this.ready;
    const store = this.db.transaction(storeName, 'readonly').objectStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const unsynced = request.result.filter((item) => !item.synced);
        resolve(unsynced);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Mark items as synced
  async markAsSynced(storeName, items) {
    await this.ready;
    const store = this.db.transaction(storeName, 'readwrite').objectStore(storeName);
    return new Promise((resolve, reject) => {
      let completed = 0;
      const total = items.length;

      if (total === 0) {
        resolve();
        return;
      }

      items.forEach((item) => {
        item.synced = true;
        const request = store.put(item);
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }
}

// Estimate serialized byte size for an object
function estimateBytes(obj) {
  try {
    const str = JSON.stringify(obj);
    return new Blob([str]).size;
  } catch (e) {
    return 0;
  }
}

// ========================================
// PREFERENCES STORAGE - localStorage wrapper
// ========================================

const PreferencesStorage = {
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  },

  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (e) {
      console.error('Error reading from localStorage:', e);
      return defaultValue;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  clear() {
    localStorage.clear();
  }
};

// ========================================
// APP CONTEXT
// ========================================

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  // THEME STATE - persists in localStorage
  const [theme, setThemeState] = useState('dark');
  
  // FILE STATE - migrated from window._quizgen_file
  const [uploadedFile, setUploadedFile] = useState(null);
  
  // STORAGE READY FLAG
  const [isStorageReady, setIsStorageReady] = useState(false);

  // STORAGE INSTANCE
  const storageRef = useRef(new LocalStorage());

  // INITIALIZE - theme detection and IndexedDB setup
  useEffect(() => {
    // Initialize theme from localStorage
    const savedTheme = PreferencesStorage.get('learnlite-theme');
    if (!savedTheme) {
      const prefers =
        window.matchMedia && window.matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark';
      setThemeState(prefers);
      PreferencesStorage.set('learnlite-theme', prefers);
      document.documentElement.setAttribute('data-theme', prefers);
    } else {
      setThemeState(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Initialize IndexedDB
    storageRef.current.ready
      .then(() => {
        setIsStorageReady(true);
      })
      .catch((err) => {
        console.error('Failed to initialize IndexedDB:', err);
        setIsStorageReady(true); // Still continue, graceful fallback
      });
  }, []);

  // THEME MANAGEMENT
  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    PreferencesStorage.set('learnlite-theme', newTheme);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // FILE MANAGEMENT
  const setFile = (file) => {
    setUploadedFile(file);
    if (file) {
      PreferencesStorage.set('learnlite-last-file', {
        name: file.name,
        size: file.size,
        type: file.type,
        timestamp: Date.now()
      });
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    PreferencesStorage.remove('learnlite-last-file');
  };

  // STORAGE METHODS - wrapped for context access
  const saveQuizAttempt = async (quizData) => {
    if (!isStorageReady) return null;
    return storageRef.current.saveQuizAttempt(quizData);
  };

  const saveChatMessage = async (message) => {
    if (!isStorageReady) return null;
    return storageRef.current.saveChatMessage(message);
  };

  const saveNote = async (noteData) => {
    if (!isStorageReady) return null;
    return storageRef.current.saveNote(noteData);
  };

  const getQuizAttempts = async () => {
    if (!isStorageReady) return [];
    return storageRef.current.getQuizAttempts();
  };

  const getChatMessages = async (groupId) => {
    if (!isStorageReady) return [];
    return storageRef.current.getChatMessages(groupId);
  };

  const getNotes = async () => {
    if (!isStorageReady) return [];
    return storageRef.current.getNotes();
  };

  const getStorageStats = async () => {
    if (!isStorageReady) return null;
    return storageRef.current.getStorageStats();
  };

  const backupToServer = async (serverUrl, token) => {
    if (!isStorageReady) return false;
    return storageRef.current.backupToServer(serverUrl, token);
  };

  // CONTEXT VALUE
  const value = {
    // Theme
    theme,
    setTheme,
    toggleTheme,

    // File Upload (migrated from window._quizgen_file)
    uploadedFile,
    setFile,
    clearFile,

    // Storage
    isStorageReady,
    saveQuizAttempt,
    saveChatMessage,
    saveNote,
    getQuizAttempts,
    getChatMessages,
    getNotes,
    getStorageStats,
    backupToServer,

    // Direct storage access
    storage: storageRef.current,
    preferences: PreferencesStorage
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ========================================
// CUSTOM HOOK
// ========================================

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
