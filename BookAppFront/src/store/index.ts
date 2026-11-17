// BookAppFront/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import bookReducer from './bookSlice';
import libraryStatusReducer from './libraryStatusSlice';
import authReducer from './authSlice';
import reviewReducer from './reviewSlice';
import notificationReducer from './notificationSlice';

export const store = configureStore({
  reducer: {
    books: bookReducer,
    libraryStatus: libraryStatusReducer,
    auth: authReducer,
    reviews: reviewReducer,
    notifications: notificationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
