import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '../services/api';

export interface User {
  id: number;
  email: string;
  nickname: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (credentials: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.signIn(credentials);
      if (response.data.success) {
        return response.data.data;
      } else {
        return rejectWithValue(response.data.message);
      }
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '로그인 실패');
    }
  }
);

export const signUp = createAsyncThunk(
  'auth/signUp',
  async (userData: { email: string; password: string; nickname: string }, { rejectWithValue }) => {
    try {
      const response = await authApi.signUp(userData);
      if (response.data.success) {
        return response.data.data;
      } else {
        return rejectWithValue(response.data.message);
      }
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '회원가입 실패');
    }
  }
);

export const getProfile = createAsyncThunk(
  'auth/getProfile',
  async (token: string, { rejectWithValue }) => {
    try {
      const response = await authApi.getProfile(token);
      if (response.data.success) {
        return response.data.data;
      } else {
        return rejectWithValue(response.data.message);
      }
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '프로필 조회 실패');
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.isLoading = false;
        state.token = action.payload.access_token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
      })
      .addCase(signUp.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signUp.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.error = null;
      })
      .addCase(signUp.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(getProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.error = null;
      })
      .addCase(getProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logout, clearError, setToken } = authSlice.actions;
export default authSlice.reducer;