import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../services/api';
import { signInErrorMessage } from '../utils/apiErrorHandler';
import type { KakaoExchange } from '../utils/kakaoLogin';

export interface User {
  id: number;
  email: string | null;
  nickname: string;
  birth_year?: number;
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

async function persistSignIn(result: { success?: boolean; data?: { access_token?: string; user?: User }; message?: string }) {
  const token = result.data?.access_token;
  const user = result.data?.user;
  if (!result.success || !token || !user) throw new Error(result.message || '로그인에 실패했습니다.');
  await AsyncStorage.setItem('accessToken', token);
  return { token, user };
}

export const signIn = createAsyncThunk<Awaited<ReturnType<typeof persistSignIn>>, { email: string; password: string }, { rejectValue: string }>(
  'auth/signIn',
  async (
    credentials,
    { rejectWithValue }
  ) => {
    try {
      const response = await authApi.signIn(credentials);

      return await persistSignIn(response.data);
    } catch (error) {
      return rejectWithValue(signInErrorMessage(error));
    }
  }
);

export const signInWithKakao = createAsyncThunk('auth/signInWithKakao', async (exchange: KakaoExchange) => {
  const response = await authApi.exchangeKakao(exchange);
  return persistSignIn(response.data);
});

export const signUp = createAsyncThunk(
  'auth/signUp',
  async (userData: { email: string; password: string; nickname: string; birth_year?: number }, { rejectWithValue }) => {
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
      return rejectWithValue(error.response?.status ?? null);
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
    setProfileNickname: (state, action: PayloadAction<{ id: number; nickname: string }>) => {
      if (state.isAuthenticated && state.user?.id === action.payload.id) {
        state.user.nickname = action.payload.nickname;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(signIn.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(signInWithKakao.fulfilled, (state, action) => {
        state.isLoading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
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
        if (state.token !== action.meta.arg) return;
        state.isLoading = false;
        state.user = action.payload;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(getProfile.rejected, (state, action) => {
        if (state.token !== action.meta.arg) return;
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { logout, clearError, setToken, setProfileNickname } = authSlice.actions;
export default authSlice.reducer;
