# Group Creation & Joining System - Implementation Guide

## Overview
Groups now use **6-character alphanumeric codes** (A-Z, 0-9) instead of numeric IDs. Examples: `MATH24`, `ENG01`, `SCI99`

---

## Backend Implementation ✅

### 1. Join Code Generator Function
**Location**: `server/index.js` (lines ~1173-1213)

**Function**: `generateJoinCode()`
- Generates random 6-character string using A-Z and 0-9
- Example outputs: `MATH24`, `AB12CD`, `XYZ789`

**Function**: `generateUniqueJoinCode()`
- Ensures no duplicate codes in database via retry loop (up to 20 attempts)
- Called automatically when creating a group
- Throws error if unable to generate (extremely rare)

### 2. Database Schema
**File**: `server/prisma/schema.prisma`

```prisma
model Group {
  id          Int           @id @default(autoincrement())
  name        String
  joinCode    String        @unique  // ✅ Ensures uniqueness
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  createdById Int

  creator     User          @relation(fields: [createdById], references: [id])
  members     GroupMember[]
}
```

---

## API Endpoints

### POST /api/groups/create
**Purpose**: Create a new group with auto-generated unique code

**Request**:
```json
{
  "name": "Advanced Biology Class"
}
```

**Response (Success - 201)**:
```json
{
  "success": true,
  "group": {
    "id": 1,
    "name": "Advanced Biology Class",
    "joinCode": "BIO24",
    "createdById": 5,
    "createdAt": "2026-03-11T10:30:00Z"
  }
}
```

**Response (Error - 400)**:
```json
{
  "success": false,
  "error": "Group name is required"
}
```

**Errors**:
- `"Group name is required"` - No name provided
- `"Group name must be 100 characters or less"` - Name too long
- `"Unauthorized"` - Invalid JWT token

**Implementation**:
The creator is automatically added as an **ADMIN** member.

---

### POST /api/groups/join
**Purpose**: Join a group using its 6-digit code

**Request**:
```json
{
  "code": "BIO24",
  "customBackground": null
}
```

**Response (Success - 201)**:
```json
{
  "success": true,
  "group": {
    "id": 1,
    "name": "Advanced Biology Class",
    "joinCode": "BIO24",
    "createdById": 5
  }
}
```

**Response (Error)**:
- `404 - "Join code not found"` - Code doesn't exist
- `400 - "You are already a member of this group"` - Already joined
- `400 - "Join code must be 6 alphanumeric characters"` - Invalid format
- `401 - "Unauthorized"` - Invalid JWT token

**Implementation**:
- Code is converted to uppercase for lookup (case-insensitive)
- New member is added as **MEMBER** role (not ADMIN)
- Optional customBackground can be set on join

---

## Frontend Implementation

### 1. API Client Methods
**File**: `src/services/api.js`

```javascript
// Create group (returns { success, group })
const result = await groupAPI.createGroup("My Class Name");

// Join group by code (returns { success, group })
const result = await groupAPI.joinGroupByCode("MATH24");
```

---

### 2. Example: Create Group Component

```jsx
import React, { useState } from 'react';
import { groupAPI } from '../services/api';

export function CreateGroupModal({ onGroupCreated, onClose }) {
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState(null);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await groupAPI.createGroup(groupName);
      
      if (result.success) {
        // Show code to creator
        setCreatedCode(result.group.joinCode);
        
        // Notify parent
        onGroupCreated(result.group);
      } else {
        setError(result.error || 'Failed to create group');
      }
    } catch (err) {
      setError(err.message || 'Server error');
    } finally {
      setLoading(false);
    }
  };

  // Show code display after successful creation
  if (createdCode) {
    return (
      <div style={{
        background: '#e8f5e9',
        padding: '20px',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <h2>Group Created! 🎉</h2>
        <p>Share this code with your students:</p>
        
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          margin: '15px 0',
          border: '2px solid #4CAF50'
        }}>
          <code style={{
            fontSize: '32px',
            fontWeight: 'bold',
            letterSpacing: '4px',
            color: '#2e7d32'
          }}>
            {createdCode}
          </code>
        </div>

        <button
          onClick={() => navigator.clipboard.writeText(createdCode)}
          style={{
            padding: '10px 20px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          Copy Code
        </button>

        <button
          onClick={() => {
            onClose();
            setCreatedCode(null);
          }}
          style={{
            padding: '10px 20px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Done
        </button>
      </div>
    );
  }

  // Show creation form
  return (
    <div style={{ padding: '20px' }}>
      <h2>Create New Group</h2>
      
      {error && (
        <div style={{
          background: '#ffebee',
          color: '#c62828',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="Group name (e.g., Biology 101)"
        value={groupName}
        onChange={(e) => setGroupName(e.target.value)}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #ddd',
          marginBottom: '16px',
          fontSize: '14px',
          boxSizing: 'border-box'
        }}
      />

      <button
        onClick={handleCreate}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          background: loading ? '#ccc' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '16px'
        }}
      >
        {loading ? 'Creating...' : 'Create Group'}
      </button>
    </div>
  );
}
```

---

### 3. Example: Join Group Component

```jsx
import React, { useState } from 'react';
import { groupAPI } from '../services/api';

export function JoinGroupModal({ onGroupJoined, onClose }) {
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setError('Join code is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await groupAPI.joinGroupByCode(joinCode.trim().toUpperCase());
      
      if (result.success) {
        // Save group to localStorage
        localStorage.setItem('currentGroupId', result.group.id);
        localStorage.setItem('currentGroupCode', result.group.joinCode);
        
        // Notify parent
        onGroupJoined(result.group);
        onClose();
      } else {
        setError(result.error || 'Failed to join group');
      }
    } catch (err) {
      setError(err.message || 'Server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Join a Group</h2>
      
      {error && (
        <div style={{
          background: '#ffebee',
          color: '#c62828',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      <input
        type="text"
        placeholder="Enter 6-letter code (e.g., MATH24)"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        maxLength="6"
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '6px',
          border: '1px solid #ddd',
          marginBottom: '16px',
          fontSize: '18px',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          boxSizing: 'border-box'
        }}
      />

      <button
        onClick={handleJoin}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          background: loading ? '#ccc' : '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          marginBottom: '10px'
        }}
      >
        {loading ? 'Joining...' : 'Join Group'}
      </button>

      <button
        onClick={onClose}
        style={{
          width: '100%',
          padding: '12px',
          background: '#f5f5f5',
          color: '#333',
          border: '1px solid #ddd',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px'
        }}
      >
        Cancel
      </button>
    </div>
  );
}
```

---

### 4. Integration with Home Page

```jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateGroupModal } from './modals/CreateGroupModal';
import { JoinGroupModal } from './modals/JoinGroupModal';

export function HomePage() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  const handleGroupCreated = (group) => {
    console.log('Group created:', group);
    // Navigate to workspace after brief delay
    setTimeout(() => {
      navigate(`/generate-quiz/${group.id}`);
    }, 2000);
  };

  const handleGroupJoined = (group) => {
    console.log('Group joined:', group);
    // Navigate to workspace immediately
    navigate(`/generate-quiz/${group.id}`);
  };

  return (
    <div>
      {/* Existing content... */}

      <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            flex: 1,
            padding: '15px',
            background: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          ➕ Create Group
        </button>

        <button
          onClick={() => setShowJoinModal(true)}
          style={{
            flex: 1,
            padding: '15px',
            background: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          🔗 Join Group
        </button>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateGroupModal
          onGroupCreated={handleGroupCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showJoinModal && (
        <JoinGroupModal
          onGroupJoined={handleGroupJoined}
          onClose={() => setShowJoinModal(false)}
        />
      )}
    </div>
  );
}
```

---

## Testing the Implementation

### Test 1: Create Group via API
```bash
curl -X POST http://localhost:4000/api/groups/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"name": "Biology 101"}'
```

### Test 2: Join Group via API
```bash
curl -X POST http://localhost:4000/api/groups/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"code": "BIO24"}'
```

---

## Storage
Save group info to localStorage:
```javascript
localStorage.setItem('currentGroupId', group.id);
localStorage.setItem('currentGroupCode', group.joinCode);
```

Retrieve when needed:
```javascript
const groupId = localStorage.getItem('currentGroupId');
const groupCode = localStorage.getItem('currentGroupCode');
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `server/index.js` | Updated `generateJoinCode()` to alphanumeric; Added `POST /api/groups/create` and `POST /api/groups/join` |
| `src/services/api.js` | Added `createGroup()` and `joinGroupByCode()` methods |
| `server/prisma/schema.prisma` | Already has `@unique` on `joinCode` ✅ |

✅ **No database migration needed** - Schema was already prepared!
