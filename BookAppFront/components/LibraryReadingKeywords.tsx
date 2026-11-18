import { useEffect, useState } from 'react';
import { Image, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LibraryBookCard } from '@/components/LibraryShelf';
import AppButton from '@/components/ui/AppButton';
import { getLibraryReadingKeywordsStyles } from '@/components/styles/LibraryReadingKeywords.styles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getMyLibraryScreenStyles } from '@/src/styles/MyLibraryScreen.styles';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';
import { readingKeywordBooks, type ReadingKeywords, type UserLibrary } from '@/src/utils/libraryOverview';
import { renderReadingKeywordCard, saveReadingKeywordCard } from '@/src/utils/readingKeywordCard';

const maxSharedKeywords = 3;

function SharePanel({ tags }: { tags: string[] }) {
  const styles = getLibraryReadingKeywordsStyles(useColorScheme() ?? 'light');
  const [selected, setSelected] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ selection: string[]; url: string | null } | null>(null);
  const current = preview?.selection === selected ? preview : null;

  useEffect(() => {
    if (!selected.length) return;
    let active = true;
    let url: string | undefined;
    void renderReadingKeywordCard(selected).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ selection: selected, url });
    }).catch(() => { if (active) setPreview({ selection: selected, url: null }); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected, attempt]);

  const toggle = (tag: string) => setSelected(previous => previous.includes(tag)
    ? previous.filter(value => value !== tag)
    : previous.length < maxSharedKeywords ? [...previous, tag] : previous);

  return (
    <>
      <Text style={styles.caption}>공개할 키워드를 최대 {maxSharedKeywords}개 골라주세요. ({selected.length}/{maxSharedKeywords})</Text>
      <View style={styles.chips}>
        {tags.map(tag => {
          const checked = selected.includes(tag);
          return <AppButton key={tag} title={tag} style={styles.chip} compact
            accessibilityRole="checkbox" accessibilityState={{ checked }}
            variant={checked ? 'primary' : 'secondary'} disabled={!checked && selected.length >= maxSharedKeywords}
            onPress={() => toggle(tag)} />;
        })}
      </View>
      {current?.url ? <Image source={{ uri: current.url }} resizeMode="contain" style={styles.preview}
        accessibilityLabel={`나의 독서 키워드 카드 미리보기. ${selected.join(', ')}`} /> : null}
      {current && !current.url ? (
        <>
          <Text style={styles.error} role="alert">이미지를 만들지 못했어요.</Text>
          <AppButton title="다시 시도" variant="secondary" onPress={() => { setPreview(null); setAttempt(value => value + 1); }} />
        </>
      ) : null}
      <AppButton title="이미지로 저장" disabled={!current?.url} loading={selected.length > 0 && !current}
        onPress={() => { if (current?.url) saveReadingKeywordCard(current.url); }} />
    </>
  );
}

export default function LibraryReadingKeywords({ data, library }: { data: ReadingKeywords; library: UserLibrary }) {
  const theme = useColorScheme() ?? 'light';
  const styles = getLibraryReadingKeywordsStyles(theme);
  const layout = getMyLibraryScreenStyles(theme);
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<{ type: 'evidence'; tag: string } | { type: 'share' } | null>(null);
  const keyword = panel?.type === 'evidence' ? data.keywords.find(item => item.tag === panel.tag) : undefined;
  const evidence = keyword ? readingKeywordBooks(keyword, library) : [];
  const sharing = panel?.type === 'share' && data.keywords.length > 0;
  const title = sharing ? '독서 키워드 공유' : keyword?.tag;
  const close = () => setPanel(null);

  if (!data.keywords.length && !data.analyzed) return null;
  return (
    <View style={styles.section} testID="library-reading-keywords">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>나의 독서 키워드</Text>
        {Platform.OS === 'web' && data.keywords.length > 0 ? (
          <AppButton title="키워드 공유" compact variant="ghost" onPress={() => setPanel({ type: 'share' })} />
        ) : null}
      </View>
      <Text style={styles.caption}>{data.keywords.length ? '읽는 중이거나 완독한 책에서 발견했어요.' : '책에 독서 키워드가 쌓이면 여기에서 볼 수 있어요.'}</Text>
      <View style={styles.chips}>
        {data.keywords.map(item => <AppButton key={item.tag} title={`${item.tag} · ${item.count}권`} style={styles.chip}
          accessibilityHint="이 키워드가 나온 책을 표시합니다." compact variant="secondary"
          onPress={() => setPanel({ type: 'evidence', tag: item.tag })} />)}
      </View>
      <Modal transparent animationType="slide" visible={!!title} onRequestClose={close}>
        <View style={layout.modalOverlay}>
          <View style={[layout.modalContent, { paddingBottom: insets.bottom }]} role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel={title}>
            <View style={layout.modalTitleRow}>
              <Text accessibilityRole="header" style={layout.modalTitle}>{title}</Text>
              <AppButton title="닫기" variant="ghost" compact onPress={close} />
            </View>
            <ScrollView contentContainerStyle={styles.body}>
              {sharing ? <SharePanel tags={data.keywords.map(item => item.tag)} /> : keyword ? (
                <>
                  <Text style={styles.caption}>{evidence.length
                    ? `읽는 중이거나 완독한 책 ${evidence.length}권에서 이 키워드가 나왔어요.`
                    : '이 키워드가 나온 책 목록을 불러올 수 없어요.'}</Text>
                  {evidence.length > 0 ? <View style={styles.books}>
                    {evidence.map(book => <LibraryBookCard key={book.isbn13} book={book} onPress={close} />)}
                  </View> : null}
                  <AppButton title="이 주제로 더 찾기" onPress={() => {
                    close();
                    router.push(aiSearchHref(`${keyword.tag}을(를) 주제로 한 책을 추천해줘`));
                  }} />
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
