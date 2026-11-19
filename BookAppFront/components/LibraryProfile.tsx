import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDispatch } from 'react-redux';
import AppButton from '@/components/ui/AppButton';
import { FormField } from '@/components/ui/AppTextInput';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { authApi } from '@/src/services/api';
import { setProfileNickname, type User } from '@/src/store/authSlice';
import { Spacing, Typography } from '@/src/styles/designTokens';
import { SCREEN_LAYOUT } from '@/src/styles/screenLayout';

export default function LibraryProfile({ user }: { user: User }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const dispatch = useDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<'save' | 'suggest' | null>(null);
  const request = useRef<AbortController | null>(null);
  const nickname = draft.trim();
  const changed = nickname !== user.nickname;

  useEffect(() => () => request.current?.abort(), []);

  const edit = () => {
    setDraft(user.nickname);
    setError('');
    setEditing(true);
  };

  const submit = async (action: 'save' | 'suggest') => {
    if (request.current || (action === 'save' && !changed)) return;
    setError('');
    if (action === 'save' && (nickname.length < 2 || nickname.length > 10)) {
      setError('닉네임은 2~10자로 입력해주세요.');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setPending(action);
    try {
      if (action === 'suggest') {
        const { data } = await authApi.suggestNickname(nickname, controller.signal);
        if (!controller.signal.aborted) setDraft(data.data.nickname);
      } else {
        const { data } = await authApi.updateNickname(nickname, controller.signal);
        if (controller.signal.aborted) return;
        dispatch(setProfileNickname(data.data));
        setEditing(false);
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (isAxiosError(failure) && failure.response?.data?.code === 'NICKNAME_DUPLICATE') {
        setError('이미 사용 중인 닉네임이에요. 다른 이름을 골라주세요.');
      } else {
        setError(action === 'save' ? '닉네임을 저장하지 못했어요. 다시 시도해주세요.'
          : '새 닉네임을 가져오지 못했어요. 다시 시도해주세요.');
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  };

  return (
    <View style={[styles.profile, { borderColor: colors.line, backgroundColor: colors.background }]}>
      <View style={styles.summary}>
        <View style={styles.identity}>
          <Text style={[Typography.label, { color: colors.text }]}>{user.nickname}</Text>
          {user.email ? <Text style={[Typography.caption, { color: colors.inkSoft }]} numberOfLines={1}>{user.email}</Text> : null}
        </View>
        {editing ? null : <AppButton title="닉네임 변경" compact variant="ghost" onPress={edit} />}
      </View>
      {editing ? (
        <View style={styles.editor}>
          <FormField label="닉네임" value={draft} hint="2~10자로 입력해주세요." error={error}
            maxLength={10} autoCapitalize="none" autoCorrect={false} editable={!pending}
            onChangeText={value => { setDraft(value); setError(''); }}
            returnKeyType="done" onSubmitEditing={() => void submit('save')} />
          <View style={styles.actions}>
            <AppButton title="다른 이름 뽑기" compact variant="secondary" loading={pending === 'suggest'}
              disabled={!!pending} onPress={() => void submit('suggest')} />
            <AppButton title="취소" compact variant="ghost" disabled={!!pending} onPress={() => setEditing(false)} />
            <AppButton title="저장" compact loading={pending === 'save'} disabled={!!pending || !changed}
              onPress={() => void submit('save')} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  profile: { borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: SCREEN_LAYOUT.gutter, paddingVertical: Spacing.xs, gap: Spacing.sm },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  identity: { flex: 1, minWidth: 0, gap: Spacing.xxs },
  editor: { gap: Spacing.sm, paddingBottom: Spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.xs },
});
