// BookAppFront/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import bookReducer from './bookSlice';
import authReducer from './authSlice';

export const store = configureStore({
  reducer: {
    books: bookReducer,
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;