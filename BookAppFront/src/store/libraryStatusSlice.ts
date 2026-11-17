import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { bookApi } from '../services/api';
import { ReadingStatus } from '../types/readingStatus';
import type { UserLibrary } from '../utils/libraryOverview';

export const readingStatusLabels: Record<ReadingStatus, string> = {
  [ReadingStatus.TO_READ]: '읽고 싶어요',
  [ReadingStatus.READING]: '읽는 중',
  [ReadingStatus.COMPLETED]: '완독',
};
export type LibraryStatusTarget = { userId: number; bookId: number };
export type LibraryStatusEntry = {
  status: ReadingStatus | null;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  saved: boolean;
  requestedStatus: ReadingStatus | null;
  error: 'load' | 'save' | null;
  requestId?: string;
};
export const emptyLibraryStatus: LibraryStatusEntry = {
  status: null, loaded: false, loading: false, saving: false, saved: false, requestedStatus: null, error: null,
};
type LibraryStatusState = { entries: Record<string, LibraryStatusEntry>; revision: number };
type StateView = {
  auth: { isAuthenticated: boolean; user: { id: number } | null };
  libraryStatus: LibraryStatusState;
};
const initialState: LibraryStatusState = { entries: {}, revision: 0 };
export const libraryStatusKey = ({ userId, bookId }: LibraryStatusTarget) => `${userId}:${bookId}`;
const isCurrentUser = (state: StateView, target: LibraryStatusTarget) =>
  state.auth.isAuthenticated && state.auth.user?.id === target.userId;

export const fetchLibraryStatus = createAsyncThunk<ReadingStatus | null, LibraryStatusTarget, { state: StateView }>(
  'libraryStatus/fetch',
  async ({ bookId }) => {
    const { data } = await bookApi.getUserLibrary({ handleErrorLocally: true });
    if (![data?.toReadBooks, data?.readingBooks, data?.completedBooks].every(Array.isArray)) throw new Error('Invalid library response');
    const library = data as UserLibrary;
    if (library.toReadBooks.some((book) => book.id === bookId)) return ReadingStatus.TO_READ;
    if (library.readingBooks.some((book) => book.id === bookId)) return ReadingStatus.READING;
    if (library.completedBooks.some((book) => book.id === bookId)) return ReadingStatus.COMPLETED;
    return null;
  },
  { condition: (target, { getState }) => {
    const state = getState();
    const entry = state.libraryStatus.entries[libraryStatusKey(target)];
    return isCurrentUser(state, target) && !entry?.loading && !entry?.saving;
  } }
);

export const saveLibraryStatus = createAsyncThunk<ReadingStatus, LibraryStatusTarget & { status: ReadingStatus }, { state: StateView }>(
  'libraryStatus/save',
  async ({ bookId, status }) => {
    await bookApi.updateBookStatus(bookId, status, { handleErrorLocally: true });
    return status;
  },
  { condition: (target, { getState }) => {
    const state = getState();
    const entry = state.libraryStatus.entries[libraryStatusKey(target)];
    return isCurrentUser(state, target) && !!entry?.loaded && !entry.loading && !entry.saving && entry.error !== 'load'
      && (entry.error === 'save' ? target.status === entry.requestedStatus : target.status !== entry.status);
  } }
);

const libraryStatusSlice = createSlice({
  name: 'libraryStatus', initialState, reducers: {},
  extraReducers: (builder) => builder
    .addCase(fetchLibraryStatus.pending, (state, action) => {
      const key = libraryStatusKey(action.meta.arg);
      state.entries[key] = { ...(state.entries[key] ?? emptyLibraryStatus), loading: true, saved: false, error: null, requestId: action.meta.requestId };
    })
    .addCase(fetchLibraryStatus.fulfilled, (state, action) => {
      const entry = state.entries[libraryStatusKey(action.meta.arg)];
      if (entry?.requestId !== action.meta.requestId) return;
      Object.assign(entry, { status: action.payload, loaded: true, loading: false, requestedStatus: null, requestId: undefined });
    })
    .addCase(fetchLibraryStatus.rejected, (state, action) => {
      const entry = state.entries[libraryStatusKey(action.meta.arg)];
      if (entry?.requestId !== action.meta.requestId) return;
      Object.assign(entry, { loading: false, error: 'load', requestId: undefined });
    })
    .addCase(saveLibraryStatus.pending, (state, action) => {
      const entry = state.entries[libraryStatusKey(action.meta.arg)];
      Object.assign(entry, { saving: true, saved: false, error: null, requestedStatus: action.meta.arg.status, requestId: action.meta.requestId });
    })
    .addCase(saveLibraryStatus.fulfilled, (state, action) => {
      const entry = state.entries[libraryStatusKey(action.meta.arg)];
      if (entry?.requestId !== action.meta.requestId) return;
      Object.assign(entry, { status: action.payload, saving: false, saved: true, requestedStatus: null, requestId: undefined });
      state.revision++;
    })
    .addCase(saveLibraryStatus.rejected, (state, action) => {
      const entry = state.entries[libraryStatusKey(action.meta.arg)];
      if (entry?.requestId !== action.meta.requestId) return;
      Object.assign(entry, { saving: false, error: 'save', requestId: undefined });
    })
    // Clearing request IDs also rejects late responses from the previous login session.
    .addMatcher((action) => action.type === 'auth/logout' || action.type === 'auth/signIn/pending', () => initialState),
});

export default libraryStatusSlice.reducer;
