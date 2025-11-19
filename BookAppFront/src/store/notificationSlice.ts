import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { notificationApi } from '../services/api';
import { Notification } from '../types/notification';

interface NotificationState {
  items: Notification[];
  loading: boolean;
  error: any | null;
  unreadCount: number;
}

const initialState: NotificationState = {
  items: [],
  loading: false,
  error: null,
  unreadCount: 0,
};

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const response = await notificationApi.getNotifications();
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.unreadCount = action.payload.filter((notification) => !notification.read).length;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
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
      });
  },
});

export const { addNotification, setNotifications } = notificationSlice.actions;
export default notificationSlice.reducer;
