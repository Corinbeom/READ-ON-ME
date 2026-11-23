import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LibraryBookCard } from '@/components/LibraryShelf';
import ReadingKeywordCloud from '@/components/ReadingKeywordCloud';
import AppButton from '@/components/ui/AppButton';
import AppTextInput from '@/components/ui/AppTextInput';
import { getLibraryReadingKeywordsStyles } from '@/components/styles/LibraryReadingKeywords.styles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getMyLibraryScreenStyles } from '@/src/styles/MyLibraryScreen.styles';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';
import { readingKeywordBooks, type ReadingKeywords, type UserLibrary } from '@/src/utils/libraryOverview';
import { drawReadingKeywordCard, loadReadingKeywordCardArtwork, readingKeywordCardSize, saveReadingKeywordCard } from '@/src/utils/readingKeywordCard';
import { isStoryKeyword, maxStoryKeywords, storyKeywordUrl } from '@/src/utils/readingKeywordShare';

function SharePanel({ tags }: { tags: string[] }) {
  const styles = getLibraryReadingKeywordsStyles(useColorScheme() ?? 'light');
  const [selected, setSelected] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<{ drawn?: string[]; failed?: string[] }>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [linkFeedback, setLinkFeedback] = useState<{ url: string; copied: boolean } | null>(null);
  const storyUrl = selected.length && typeof window !== 'undefined'
    ? storyKeywordUrl(window.location.origin, selected) : '';
  const feedback = linkFeedback?.url === storyUrl ? linkFeedback : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    void loadReadingKeywordCardArtwork().then(artwork => {
      if (!active) return;
      drawReadingKeywordCard(canvas, artwork, selected);
      setPreview({ drawn: selected });
    }).catch(() => { if (active) setPreview(previous => ({ ...previous, failed: selected })); });
    return () => { active = false; };
  }, [selected, attempt]);

  const toggle = (tag: string) => {
    setLinkFeedback(null);
    setSaveFailed(false);
    setSelected(previous => previous.includes(tag) ? previous.filter(value => value !== tag)
      : previous.length < maxStoryKeywords ? [...previous, tag] : previous);
  };

  const saveCard = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !selected.length || preview.drawn !== selected || saving) return;
    setSaveFailed(false);
    setSaving(true);
    try {
      await saveReadingKeywordCard(canvas);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const copyStoryLink = async () => {
    try {
      await navigator.clipboard.writeText(storyUrl);
      setLinkFeedback({ url: storyUrl, copied: true });
    } catch {
      setLinkFeedback({ url: storyUrl, copied: false });
    }
  };

  return (
    <>
      <Text style={styles.caption}>공개할 키워드를 최대 {maxStoryKeywords}개 골라주세요. ({selected.length}/{maxStoryKeywords})</Text>
      <View style={styles.chips}>
        {tags.map(tag => {
          const checked = selected.includes(tag);
          return <AppButton key={tag} title={tag} style={styles.chip} compact
            accessibilityRole="checkbox" accessibilityState={{ checked }}
            variant={checked ? 'primary' : 'secondary'} disabled={!checked && selected.length >= maxStoryKeywords}
            onPress={() => toggle(tag)} />;
        })}
      </View>
      <View style={styles.preview}>
        <canvas ref={canvasRef} {...readingKeywordCardSize} role="img"
          aria-label={preview.drawn?.length ? `나의 독서 키워드 카드 미리보기. ${preview.drawn.join(', ')}` : '나의 독서 키워드 카드 미리보기'}
          style={{ display: 'block', width: '100%', height: 'auto' }} />
      </View>
      {preview.failed === selected ? (
        <>
          <Text style={styles.error} role="alert">이미지를 만들지 못했어요.</Text>
          <AppButton title="다시 시도" variant="secondary" onPress={() => { setAttempt(value => value + 1); }} />
        </>
      ) : null}
      <AppButton title="이미지로 저장" disabled={!selected.length || preview.drawn !== selected} loading={saving}
        onPress={() => { void saveCard(); }} />
      {saveFailed ? <Text style={styles.error} role="alert">이미지를 저장하지 못했어요. 다시 시도해주세요.</Text> : null}
      <AppButton title="스토리 링크 복사" variant="secondary" disabled={!storyUrl}
        onPress={() => { void copyStoryLink(); }} />
      {feedback?.copied ? (
        <Text style={styles.caption} role="status" accessibilityLiveRegion="polite">
          링크를 복사했어요. 인스타 스토리에서 링크 스티커에 붙여넣으세요.
        </Text>
      ) : feedback ? (
        <View style={styles.linkFallback}>
          <Text style={styles.caption}>아래 주소를 복사해 스토리의 링크 스티커에 붙여넣으세요.</Text>
          <AppTextInput accessibilityLabel="스토리 링크" value={storyUrl} editable={false} selectTextOnFocus />
        </View>
      ) : null}
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
  const storyTags = data.keywords.map(item => item.tag).filter(isStoryKeyword);
  const sharing = panel?.type === 'share' && storyTags.length > 0;
  const title = sharing ? '독서 키워드 공유' : keyword?.tag;
  const close = () => setPanel(null);
  const words = data.keywords.slice(0, 12);

  const eligible = new Set([...library.readingBooks, ...library.completedBooks].map(book => book.isbn13)).size;
  return (
    <View style={styles.section} testID="library-reading-keywords">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>나의 독서 키워드</Text>
        {Platform.OS === 'web' && storyTags.length > 0 ? (
          <AppButton title="키워드 공유" compact variant="ghost" onPress={() => setPanel({ type: 'share' })} />
        ) : null}
      </View>
      <Text style={styles.caption}>{eligible
        ? `읽는 중·완독한 책 ${eligible}권 중 ${data.analyzed}권에서 키워드를 찾았어요.`
        : '읽는 중이거나 완독한 책이 생기면 여기에서 독서 키워드를 볼 수 있어요.'}</Text>
      {words.length ? <ReadingKeywordCloud key={JSON.stringify(words.map(item => [item.tag, item.count]))}
        keywords={words} onSelect={tag => setPanel({ type: 'evidence', tag })} /> : null}
      <Modal transparent animationType="slide" visible={!!title} onRequestClose={close}>
        <View style={layout.modalOverlay}>
          <View style={[layout.modalContent, { paddingBottom: insets.bottom }]} role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel={title}>
            <View style={layout.modalTitleRow}>
              <Text accessibilityRole="header" style={layout.modalTitle}>{title}</Text>
              <AppButton title="닫기" variant="ghost" compact onPress={close} />
            </View>
            <ScrollView contentContainerStyle={styles.body}>
              {sharing ? <SharePanel tags={storyTags} /> : keyword ? (
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
