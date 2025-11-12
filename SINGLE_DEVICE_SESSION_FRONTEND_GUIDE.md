# Frontend Integration Guide: Single Device Session Management

## Overview

The backend now enforces single-device login per user. When a user logs in from a new device, all previous sessions are automatically invalidated. Your frontend needs to detect this and logout the user appropriately.

## What Changed in the API

All API responses now include an `isSessionValid` boolean field:

```typescript
interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  timestamp: string;
  isSessionValid?: boolean;  // NEW FIELD
}
```

## Required Implementation

### 1. Create Global API Interceptor

You need to check `isSessionValid` in **every** API response and handle logout accordingly.

#### React + Axios Example

```typescript
// src/services/api.ts
import axios from 'axios';
import { toast } from 'react-toastify'; // or your notification library

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

// Request interceptor - add token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - check session validity
api.interceptors.response.use(
  (response) => {
    // Check if session is invalid
    if (response.data?.isSessionValid === false) {
      handleSessionInvalidation();
    }
    return response;
  },
  (error) => {
    // Also check in error responses
    if (error.response?.data?.isSessionValid === false) {
      handleSessionInvalidation();
    }
    return Promise.reject(error);
  }
);

function handleSessionInvalidation() {
  // Clear all auth data
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  
  // Show notification to user
  toast.error('You have been logged out because you logged in from another device');
  
  // Redirect to login page
  window.location.href = '/login';
}

export default api;
```

#### React + Fetch API Example

```typescript
// src/services/api.ts
export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  const data = await response.json();

  // Check session validity
  if (data.isSessionValid === false) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Session invalidated - logged in from another device');
  }

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}
```

#### Angular Example

```typescript
// src/app/interceptors/session.interceptor.ts
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable()
export class SessionInterceptor implements HttpInterceptor {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      tap({
        next: (event) => {
          if (event instanceof HttpResponse) {
            const isSessionValid = event.body?.isSessionValid;
            if (isSessionValid === false) {
              this.handleSessionInvalidation();
            }
          }
        },
        error: (error) => {
          const isSessionValid = error.error?.isSessionValid;
          if (isSessionValid === false) {
            this.handleSessionInvalidation();
          }
        }
      })
    );
  }

  private handleSessionInvalidation() {
    this.authService.logout();
    this.router.navigate(['/login']);
    alert('You have been logged out because you logged in from another device');
  }
}
```

Don't forget to provide the interceptor in your `app.module.ts`:

```typescript
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { SessionInterceptor } from './interceptors/session.interceptor';

@NgModule({
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: SessionInterceptor,
      multi: true
    }
  ]
})
```

#### Vue.js + Axios Example

```typescript
// src/plugins/axios.ts
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus'; // or your notification library

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    if (response.data?.isSessionValid === false) {
      handleSessionInvalidation();
    }
    return response;
  },
  (error) => {
    if (error.response?.data?.isSessionValid === false) {
      handleSessionInvalidation();
    }
    return Promise.reject(error);
  }
);

function handleSessionInvalidation() {
  const authStore = useAuthStore();
  const router = useRouter();
  
  authStore.logout();
  
  ElMessage.error('You have been logged out because you logged in from another device');
  
  router.push('/login');
}

export default api;
```

### 2. Update Your Login Flow

No changes needed! The login endpoint still works the same way. Just make sure you're storing the token returned from login.

```typescript
// Example login function
async function login(username: string, password: string) {
  try {
    const response = await api.post('/auth/login', { username, password });
    
    // Store token and user data
    localStorage.setItem('authToken', response.data.data.token);
    localStorage.setItem('user', JSON.stringify(response.data.data.user));
    
    // isSessionValid will be true for a fresh login
    console.log('Session valid:', response.data.isSessionValid); // true
    
    return response.data;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}
```

### 3. Update Your Logout Flow

Optional: Call the logout endpoint to clear the session from the backend (recommended).

```typescript
async function logout() {
  try {
    // Call backend logout endpoint
    await api.post('/auth/logout');
  } catch (error) {
    console.error('Logout API call failed:', error);
    // Continue with local cleanup anyway
  } finally {
    // Always clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    
    // Redirect to login
    window.location.href = '/login';
  }
}
```

## User Experience Recommendations

### 1. Show Clear Notification

When `isSessionValid: false` is detected, show a clear message to the user:

```typescript
toast.info('You have been logged out because you logged in from another device');
// or
alert('Your session ended because you logged in elsewhere');
// or
showModal({
  title: 'Session Ended',
  message: 'You have been logged in from another device. Please login again.',
  type: 'info'
});
```

### 2. Don't Show Error Messages

`isSessionValid: false` is not an error - it's expected behavior. Don't show error notifications like "Session expired" or "Authentication failed".

### 3. Smooth Transition

Consider adding a brief delay before redirecting to give the user time to read the notification:

```typescript
function handleSessionInvalidation() {
  localStorage.removeItem('authToken');
  
  toast.info('Logged in from another device. Redirecting...');
  
  setTimeout(() => {
    window.location.href = '/login';
  }, 2000); // 2 second delay
}
```

### 4. Prevent Multiple Alerts

Use a flag to prevent multiple alerts if multiple API calls return `isSessionValid: false` simultaneously:

```typescript
let isHandlingInvalidSession = false;

function handleSessionInvalidation() {
  if (isHandlingInvalidSession) return;
  
  isHandlingInvalidSession = true;
  
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  
  toast.info('You have been logged out because you logged in from another device');
  
  setTimeout(() => {
    window.location.href = '/login';
  }, 1500);
}
```

## Testing Your Implementation

### Test Scenario

1. Open your app in **Browser A** (e.g., Chrome)
2. Login as a test user
3. Navigate around, make some API calls
4. Open your app in **Browser B** (e.g., Firefox or Incognito)
5. Login as the **same user**
6. Go back to **Browser A**
7. Try to perform any action (e.g., refresh page, click a button)
8. **Expected Result**: Browser A should detect `isSessionValid: false` and logout immediately

### Debug Tips

Add console logging to verify the interceptor is working:

```typescript
api.interceptors.response.use(
  (response) => {
    console.log('[Session Check]', {
      endpoint: response.config.url,
      isSessionValid: response.data?.isSessionValid
    });
    
    if (response.data?.isSessionValid === false) {
      console.warn('[Session Invalid] Logging out user');
      handleSessionInvalidation();
    }
    return response;
  }
);
```

## Important Notes

### 1. Check EVERY Response

The `isSessionValid` check must be in a **global interceptor** that runs for every API response, not just authentication endpoints.

### 2. Handle Both Success and Error Responses

Some frameworks return error responses differently. Make sure to check `isSessionValid` in both cases.

### 3. Don't Skip Public Endpoints

Even public endpoints will return `isSessionValid: true` by default. It's safe to check all responses.

### 4. Session Validity is Per-Request

Each API response tells you if the session is valid **at that moment**. You don't need to manually check or poll.

### 5. No Need to Call Logout API When Invalid

When `isSessionValid: false`, the session is already dead on the backend. You can optionally call the logout endpoint, but it's not required. Just clear local storage and redirect.

## Common Mistakes to Avoid

❌ **Only checking on authentication endpoints**
```typescript
// Wrong
if (url.includes('/auth/') && response.data.isSessionValid === false) {
  logout();
}
```

✅ **Check on all authenticated requests**
```typescript
// Correct
if (response.data?.isSessionValid === false) {
  logout();
}
```

---

❌ **Treating it as an error**
```typescript
// Wrong
if (response.data.isSessionValid === false) {
  showError('Session expired! Please contact support.');
}
```

✅ **Treating it as expected behavior**
```typescript
// Correct
if (response.data.isSessionValid === false) {
  showInfo('Logged in from another device. Redirecting to login...');
}
```

---

❌ **Forgetting to clear all auth data**
```typescript
// Wrong
function handleSessionInvalidation() {
  localStorage.removeItem('authToken');
  // Forgot to clear user data, permissions, etc.
}
```

✅ **Clear everything**
```typescript
// Correct
function handleSessionInvalidation() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('permissions');
  sessionStorage.clear(); // if you use sessionStorage
}
```

## Questions & Support

If you have questions or issues with the implementation:

1. Check that the interceptor is registered correctly
2. Verify it runs on all API calls (add console.log)
3. Test with two different browsers/devices
4. Check browser console for any errors
5. Contact the backend team for support

## API Response Examples

### Valid Session
```json
{
  "success": true,
  "data": { ... },
  "isSessionValid": true,
  "timestamp": "2025-11-11T10:30:00.000Z"
}
```

### Invalid Session (Logged in elsewhere)
```json
{
  "success": true,
  "data": { ... },
  "isSessionValid": false,
  "timestamp": "2025-11-11T10:30:00.000Z"
}
```

Note: The request still succeeds (`success: true`) but `isSessionValid` tells you the session is no longer valid.

