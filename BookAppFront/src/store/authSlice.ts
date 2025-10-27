import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  error: any | null;
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
  async (
    credentials: { email: string; password: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await authApi.signIn(credentials);

      // ✅ READ-ON-ME 백엔드 구조 기준
      const { success, data, message } = response.data;

      if (!success || !data) {
        return rejectWithValue(message || '로그인 실패');
      }

      const { access_token, user } = data;

      if (!access_token) {
        return rejectWithValue('JWT 토큰이 응답에 없습니다.');
      }

      // ✅ AsyncStorage에 토큰 저장
      await AsyncStorage.setItem('accessToken', access_token);
      console.log('🔐 로그인 성공 — 토큰 저장 완료:', access_token);

      return { token: access_token, user };
    } catch (error: any) {
      console.error('로그인 실패:', error.response?.data);
      return rejectWithValue(
        error.response?.data || { message: '로그인 중 오류가 발생했습니다.' }
      );
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
        // This case might not be hit if backend always throws error for failure
        return rejectWithValue(response.data);
      }
    } catch (error: any) {
      console.error('회원가입 실패:', error.response?.data);
      return rejectWithValue(error.response?.data);
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
        return rejectWithValue(response.data);
      }
    } catch (error: any) {
      console.error('프로필 조회 실패:', error.response?.data);
      return rejectWithValue(error.response?.data);
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
      AsyncStorage.removeItem('accessToken');
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
        state.token = action.payload.token;
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