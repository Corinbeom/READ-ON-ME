import { useEffect, useRef } from 'react';
import EventSource from 'react-native-event-source';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/src/store';
import { addNotification, fetchNotifications } from '@/src/store/notificationSlice';
import { API_BASE_URL } from '@/src/services/api';
import { Notification } from '@/src/types/notification';
import customAlert from '@/src/utils/alert';

const NotificationListener = () => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch<AppDispatch>();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    const cleanupSource = () => {
      if (!eventSourceRef.current) {
        return;
      }
      try {
        eventSourceRef.current.close();
      } catch (error) {
        console.warn('EventSource close failed', error);
      } finally {
        eventSourceRef.current = null;
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

    const connectStream = async () => {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token || !isMounted) {
        return;
      }

      cleanupSource();
      const source = new EventSource(`${API_BASE_URL}/api/notifications/stream`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      eventSourceRef.current = source;

      const handleNotification = (event: { data: string }) => {
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
      source.addEventListener('error', () => {
        cleanupSource();
        scheduleReconnect();
      });
    };

    if (isAuthenticated) {
      dispatch(fetchNotifications());
      void connectStream();
    } else {
      cleanupSource();
      cleanupTimer();
    }

    return () => {
      isMounted = false;
      cleanupTimer();
      cleanupSource();
    };
  }, [dispatch, isAuthenticated]);

  return null;
};

export default NotificationListener;
