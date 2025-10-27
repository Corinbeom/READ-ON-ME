// BookAppFront/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import bookReducer from './bookSlice';
import authReducer from './authSlice';
import reviewReducer from './reviewSlice';

export const store = configureStore({
  reducer: {
    books: bookReducer,
    auth: authReducer,
    reviews: reviewReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;