import { useRef } from 'react';
import { ActivityIndicator, FlatList, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Clock3, X } from 'lucide-react-native';
import BookmarkMascot from '@/components/BookmarkMascot';
import TabScreen, { TabHeader } from '@/components/TabScreen';
import AppButton from '@/components/ui/AppButton';
import AppTextInput from '@/components/ui/AppTextInput';
import ScreenState from '@/components/ui/ScreenState';
import BookListSkeleton from '@/components/ui/BookListSkeleton';
import { Colors } from '@/constants/Colors';
import { useBookSearch } from '@/hooks/useBookSearch';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { AI_SEARCH_EXAMPLES } from '@/src/constants/aiSearchExamples';
import { getSearchScreenStyles } from '@/src/styles/SearchScreen.styles';
import type { KakaoBook } from '@/src/types/kakaoBook';
import { aiSearchHref } from '@/src/utils/aiSearchEntry';
import { getIsbn13 } from '@/src/utils/bookUtils';
import { secureImageUri } from '@/src/utils/imageUri';
import { MAX_SEARCH_LENGTH } from '@/src/utils/recentSearches';

export default function SearchScreen() {
  const theme = useColorScheme() ?? 'light';
  const c = Colors[theme];
  const styles = getSearchScreenStyles(theme);
  const history = useRecentSearches();
  const search = useBookSearch(history.add);
  const input = useRef<TextInput>(null);
  const typing = search.status === 'idle' && !!search.query.trim();
  const previewing = search.status === 'idle' && search.suggestions.length > 0;

  const renderBookItem = ({ item }: { item: KakaoBook }) => {
    const isbn13 = getIsbn13(item);
    const content = (
      <TouchableOpacity style={styles.bookItem} activeOpacity={0.8} disabled={!isbn13}>
        <Image source={{ uri: secureImageUri(item.thumbnail) }} style={styles.thumbnail} resizeMode="cover" />
        <View style={styles.bookInfo}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.authors} numberOfLines={1}>{item.authors.join(', ')}</Text>
        </View>
        {isbn13 ? <Text style={styles.chevron}>›</Text> : null}
      </TouchableOpacity>
    );
    return isbn13 ? <Link href={`/book/${isbn13}`} asChild>{content}</Link> : content;
  };

  const renderSuggestion = ({ item }: { item: KakaoBook }) => (
    <TouchableOpacity style={styles.suggestionItem} accessibilityRole="button"
      accessibilityLabel={`${item.title} 검색`} onPress={() => { void search.search(item.title); }} activeOpacity={0.7}>
      <Image source={{ uri: secureImageUri(item.thumbnail) }} style={styles.suggestionThumbnail} resizeMode="cover" />
      <View style={{ flex: 1 }}>
        <Text style={styles.suggestionTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.suggestionAuthor} numberOfLines={1}>{item.authors.join(', ')}</Text>
      </View>
    </TouchableOpacity>
  );

  const startContent = (
    <View>
      {history.items.length ? (
        <View style={styles.section} testID="recent-book-searches">
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>최근 검색어</Text>
            <AppButton title="전체 삭제" compact variant="ghost" accessibilityLabel="최근 검색어 전체 삭제"
              onPress={() => { void history.clear(); }} />
          </View>
          {history.items.map((query) => (
            <View key={query.toLowerCase()} style={styles.historyRow}>
              <TouchableOpacity style={styles.historySearch} accessibilityRole="button"
                accessibilityLabel={`${query} 다시 검색`} onPress={() => { void search.search(query); }}>
                <Clock3 size={18} color={c.inkSoft} aria-hidden />
                <Text numberOfLines={1} style={styles.historyText}>{query}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.historyDelete} accessibilityRole="button"
                accessibilityLabel={`${query} 검색어 삭제`} onPress={() => { void history.remove(query); }}>
                <X size={18} color={c.inkSoft} aria-hidden />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : <Text style={styles.intro}>책 제목이나 작가 이름으로 검색해보세요.</Text>}
      {history.error ? <Text accessibilityRole="alert" style={styles.historyError}>{history.error}</Text> : null}
      <View style={styles.aiCard} testID="search-ai-discovery">
        <View style={styles.aiHeading}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, styles.aiCopy]}>취향으로 찾아볼까요?</Text>
          <BookmarkMascot state="idle" size={56} compact />
        </View>
        <Text style={styles.aiDescription}>분위기나 관심사에 맞는 책을{`\n`}AI 사서 갈피와 함께 찾아보세요.</Text>
        <AppButton title="갈피와 책 고르기" onPress={() => router.push(aiSearchHref())} />
        <View style={styles.aiExamples}>
          {AI_SEARCH_EXAMPLES.map((example) => (
            <AppButton key={example.label} title={example.label} compact variant="secondary" style={styles.aiExample}
              onPress={() => router.push(aiSearchHref(example.query))} />
          ))}
        </View>
      </View>
    </View>
  );

  const header = search.status === 'loading'
    ? search.retaining ? <View style={styles.refreshRow} role="status"><ActivityIndicator size={14} color={c.inkSoft} /><Text style={styles.refreshText}>기존 검색 결과를 새로 확인하고 있어요.</Text></View>
      : <BookListSkeleton layout="rows" label="검색한 책 목록을 불러오고 있어요" />
    : search.status === 'error'
      ? <ScreenState title={search.retaining ? '기존 결과를 갱신하지 못했어요' : '책을 불러오지 못했어요'} description="연결 상태를 확인하고 다시 시도해주세요."
        action="다시 시도" onAction={() => { void search.search(search.submittedQuery); }} />
      : search.status === 'success'
        ? search.books.length ? <Text style={styles.resultLabel}>{search.books.length}권의 검색 결과</Text> : null
        : typing ? (
          <View style={styles.previewHeader}>
            {search.suggesting ? <ActivityIndicator size="small" color={c.inkSoft} /> : null}
            <Text style={styles.previewHint}>{search.suggesting ? '제목을 미리 찾아보고 있어요.' : previewing ? '제목 미리보기 · 검색하면 더 많은 책을 볼 수 있어요.'
              : search.suggestionError ? '미리보기를 불러오지 못했어요. 검색 버튼으로 다시 찾아보세요.' : '검색 버튼을 눌러 책을 찾아보세요.'}</Text>
          </View>
        ) : startContent;

  return (
    <TabScreen testID="search-tab-screen">
      <TabHeader title="검색." />
      <View style={styles.searchSection}>
        <View style={styles.searchRow}>
          <AppTextInput ref={input} inline style={styles.searchInput} placeholder="제목 또는 저자"
            accessibilityLabel="제목 또는 저자" autoCapitalize="none" autoCorrect={false}
            value={search.query} onChangeText={search.changeQuery} maxLength={MAX_SEARCH_LENGTH}
            onSubmitEditing={() => { void search.search(); }} returnKeyType="search" />
          {search.query ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="검색어 지우기" style={styles.clearInput}
            onPress={() => { search.changeQuery(''); input.current?.focus(); }}><X size={18} color={c.inkSoft} aria-hidden /></TouchableOpacity> : null}
          <AppButton title="검색" disabled={!search.query.trim() || search.status === 'loading'} onPress={() => { void search.search(); }} style={styles.searchButton} />
        </View>
      </View>
      <FlatList
        data={search.status === 'success' || search.retaining ? search.books : search.status === 'idle' ? search.suggestions : []}
        renderItem={previewing ? renderSuggestion : renderBookItem}
        keyExtractor={(item, index) => `${item.isbn || item.title}:${index}`}
        style={styles.list} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag" ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListHeaderComponent={header}
        ListEmptyComponent={search.status === 'success' && !search.books.length
          ? <ScreenState title="검색 결과가 없어요" description="다른 제목이나 작가 이름으로 다시 찾아보세요."
            action="갈피와 찾아보기" onAction={() => router.push(aiSearchHref())} /> : null}
      />
    </TabScreen>
  );
}
