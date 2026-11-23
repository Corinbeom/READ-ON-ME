import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { notificationApi } from '../services/api';
import { Notification } from '../types/notification';

interface NotificationState {
  items: Notification[];
  listStatus: 'idle' | 'loading' | 'ready' | 'failed';
  requestId?: string;
  unreadCount: number;
  aiSearchStreamReady: boolean;
  completedAiSearchIds: string[];
}

const initialState: NotificationState = {
  items: [],
  listStatus: 'idle',
  unreadCount: 0,
  aiSearchStreamReady: false,
  completedAiSearchIds: [],
};

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await notificationApi.getNotifications({ handleErrorLocally: true });
      return response.data.data as Notification[];
    } catch (error: any) {
      return rejectWithValue(error.response?.data ?? '알림 조회 실패');
    }
  }
);

export const markNotificationAsRead = createAsyncThunk(
  'notifications/markRead',
  async (notificationId: number, { rejectWithValue }) => {
    try {
      await notificationApi.markAsRead(notificationId);
      return notificationId;
    } catch (error: any) {
      return rejectWithValue(error.response?.data ?? '알림 읽음 처리 실패');
    }
  }
);

export const markAllNotificationsAsRead = createAsyncThunk(
  'notifications/markAllRead',
  async (_, { rejectWithValue }) => {
    try {
      await notificationApi.markAllAsRead();
    } catch (error: any) {
      return rejectWithValue(error.response?.data ?? '전체 읽음 처리 실패');
    }
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    addNotification: (state, action: PayloadAction<Notification>) => {
      state.items = [action.payload, ...state.items];
      state.unreadCount += 1;
    },
    setNotifications: (state, action: PayloadAction<Notification[]>) => {
      state.items = action.payload;
      state.unreadCount = action.payload.filter((notification) => !notification.read).length;
    },
    setAiSearchStreamReady: (state, action: PayloadAction<boolean>) => {
      state.aiSearchStreamReady = action.payload;
    },
    recordAiSearchCompletion: (state, action: PayloadAction<string>) => {
      if (!state.completedAiSearchIds.includes(action.payload)) {
        state.completedAiSearchIds = [action.payload, ...state.completedAiSearchIds].slice(0, 20);
      }
    },
    clearAiSearchCompletions: (state) => {
      state.completedAiSearchIds = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state, action) => {
        state.listStatus = 'loading';
        state.requestId = action.meta.requestId;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.requestId = undefined;
        state.listStatus = 'ready';
        state.items = action.payload;
        state.unreadCount = action.payload.filter((notification) => !notification.read).length;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.requestId = undefined;
        state.listStatus = 'failed';
      })
      .addCase(markNotificationAsRead.fulfilled, (state, action) => {
        state.items = state.items.map((notification) =>
          notification.id === action.payload ? { ...notification, read: true } : notification
        );
        state.unreadCount = state.items.filter((notification) => !notification.read).length;
      })
      .addCase(markAllNotificationsAsRead.fulfilled, (state) => {
        state.items = state.items.map((notification) => ({ ...notification, read: true }));
        state.unreadCount = 0;
      })
      .addCase('auth/logout', () => initialState);
  },
});

export const {
  addNotification, setNotifications, setAiSearchStreamReady, recordAiSearchCompletion, clearAiSearchCompletions,
} = notificationSlice.actions;
export default notificationSlice.reducer;
