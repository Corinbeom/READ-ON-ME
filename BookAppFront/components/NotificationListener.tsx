import { useEffect, useRef } from 'react';
import EventSource from 'react-native-sse';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/src/store';
import {
  addNotification, fetchNotifications, setAiSearchStreamReady, recordAiSearchCompletion, clearAiSearchCompletions,
} from '@/src/store/notificationSlice';
import { API_BASE_URL } from '@/src/services/api';
import { Notification } from '@/src/types/notification';
import { completionJobId } from '@/src/utils/aiJobStatusWatcher';
import customAlert from '@/src/utils/alert';

type NotificationEvent = 'notification' | 'INIT' | 'ai-search-finished';

const NotificationListener = () => {
  const { isAuthenticated, token } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch<AppDispatch>();
  const eventSourceRef = useRef<EventSource<NotificationEvent> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const cleanupSource = () => {
      const source = eventSourceRef.current;
      eventSourceRef.current = null;
      dispatch(setAiSearchStreamReady(false));
      if (!source) return;
      try {
        source.removeAllEventListeners();
        source.close();
      } catch (error) {
        console.warn('EventSource close failed', error);
      }
    };

    const cleanupTimer = () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };


    const scheduleReconnect = () => {
      if (reconnectTimer.current || !isMounted) {
        return;
      }
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        void connectStream();
      }, 5000);
    };

    const connectStream = () => {
      if (!token || !isMounted) return;

      cleanupSource();
      const source = new EventSource<NotificationEvent>(`${API_BASE_URL}/api/notifications/stream`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutBeforeConnection: 0,
      });

      eventSourceRef.current = source;

      const handleNotification = (event: { data: string | null }) => {
        if (eventSourceRef.current !== source || !event.data) return;
        try {
          const payload: Notification = JSON.parse(event.data);
          dispatch(addNotification(payload));
          dispatch(fetchNotifications());
          customAlert('새 알림', payload.message);
        } catch (error) {
          console.warn('Failed to parse notification event', error);
        }
      };

      source.addEventListener('notification', handleNotification);
      source.addEventListener('INIT', ({ data }) => {
        if (eventSourceRef.current !== source) return;
        try {
          dispatch(setAiSearchStreamReady(!!data && JSON.parse(data)?.aiSearchCompletion === true));
        } catch {
          dispatch(setAiSearchStreamReady(false));
        }
      });
      source.addEventListener('ai-search-finished', ({ data }) => {
        if (eventSourceRef.current !== source) return;
        const id = completionJobId(data);
        if (id) dispatch(recordAiSearchCompletion({ id, receivedAt: performance.now() }));
      });
      source.addEventListener('error', (event) => {
        if (eventSourceRef.current !== source) return;
        dispatch(setAiSearchStreamReady(false));
        // HTTP errors retry automatically. Network errors need a new connection.
        if (event.type === 'error' && event.xhrStatus !== 0) return;
        cleanupSource();
        scheduleReconnect();
      });
    };

    if (isAuthenticated && token) {
      dispatch(fetchNotifications());
      connectStream();
    } else {
      cleanupSource();
      cleanupTimer();
    }

    return () => {
      isMounted = false;
      cleanupTimer();
      cleanupSource();
      dispatch(clearAiSearchCompletions());
    };
  }, [dispatch, isAuthenticated, token]);

  return null;
};

export default NotificationListener;
