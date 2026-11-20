import React, { useState } from 'react';
import {
  Platform,
  TouchableOpacity,
  ScrollView,
  Modal,
  View,
  Text,
} from 'react-native';
import { Bell } from 'lucide-react-native';
import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { useHomeBooks, calcAgeGroup } from '@/hooks/useHomeBooks';
import { getHomeScreenStyles } from '@/src/styles/HomeScreen.styles';
import BookCarousel from '@/components/BookCarousel';
import AppButton from '@/components/ui/AppButton';
import HomeAiPrompt from '@/components/HomeAiPrompt';
import GalpiAvailability from '@/components/GalpiAvailability';
import HomeBookCollection from '@/components/HomeBookCollection';
import HomeRecentBooks from '@/components/HomeRecentBooks';
import TabScreen, { TabHeader } from '@/components/TabScreen';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

const homeUrl = 'https://read-on-me-beta.pages.dev/';
const shareTitle = 'Read On Me · 갈피와 함께 읽을 책 고르기';
const shareDescription = 'AI 사서 갈피에게 원하는 분위기를 말해보세요. 추천받은 책을 비교하고 마음에 드는 한 권을 서재에 담을 수 있어요.';

export default function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);

  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { unreadCount } = useSelector((state: RootState) => state.notifications);
  const birthYear = user?.birth_year;
  const { popular, recommendations } = useHomeBooks(isAuthenticated ? user?.id : undefined, isAuthenticated ? birthYear : undefined);

  const colorScheme = useColorScheme() ?? 'dark';
  const styles = getHomeScreenStyles(colorScheme);
  const c = Colors[colorScheme];
  const hasUnreadNotifications = unreadCount > 0;

  const now = new Date();
  const issueLabel = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;

  return (
    <TabScreen testID="home-tab-screen">
    {Platform.OS === 'web' ? (
      <Head>
        <title>{shareTitle}</title>
        <meta name="description" content={shareDescription} />
        <link rel="canonical" href={homeUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Read On Me" />
        <meta property="og:locale" content="ko_KR" />
        <meta property="og:title" content={shareTitle} />
        <meta property="og:description" content={shareDescription} />
        <meta property="og:url" content={homeUrl} />
        <meta property="og:image" content={`${homeUrl}galpi-share-card.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Read On Me. 다음에 읽을 한 권, 갈피와 함께." />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
    ) : null}
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* ── Masthead ── */}
      <TabHeader title="Read On Me">
        <View style={styles.mastheadRight}>
          {isAuthenticated ? (
            <TouchableOpacity
              onPress={() => router.push('/notifications')}
              style={styles.notificationBellButton}
              accessibilityLabel="알림 확인"
            >
              <Bell size={22} color={c.text} aria-hidden />
              {hasUnreadNotifications && <View style={styles.notificationDot} />}
            </TouchableOpacity>
          ) : (
            <View style={styles.authButtons}>
              <AppButton title="로그인" variant="secondary" compact onPress={() => router.push('/auth/login')} />
              <AppButton title="회원가입" compact onPress={() => router.push('/auth/register')} />
            </View>
          )}
        </View>
      </TabHeader>

      {/* ── Issue Bar ── */}
      <View style={styles.issueBar}>
        <Text style={styles.issueBarText}>{issueLabel} · Read On Me</Text>
        <Text style={styles.issueBarText}>다음에 읽을 한 권</Text>
      </View>

      <GalpiAvailability>
        <HomeAiPrompt />
        <HomeBookCollection />
      </GalpiAvailability>
      <HomeRecentBooks />

      {/* ── 인기 책 (도서관 정보나루) ── */}
      <View>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {isAuthenticated && user?.birth_year
              ? `${calcAgeGroup(user.birth_year)}대에게 인기인 책`
              : '이달의 인기 책'}
          </Text>
          {popular.books.length > 0 && (
            <Text style={styles.sectionCount}>{popular.books.length}권</Text>
          )}
        </View>
        {popular.books[0]?.loanRanking && (
          <Text style={styles.birthYearHint}>
            {popular.books[0].loanRanking.source} · {popular.books[0].loanRanking.date} 기준 · {popular.books[0].loanRanking.ageGroup ? `${popular.books[0].loanRanking.ageGroup}대` : '전체 연령'}
          </Text>
        )}
        {isAuthenticated && !user?.birth_year && (
          <Text style={styles.birthYearHint}>
            출생연도를 설정하면 나이대에 맞는 인기 책을 볼 수 있어요
          </Text>
        )}
        <View style={styles.sectionDivider} />
        <BookCarousel
          title=""
          books={popular.books}
          loading={popular.loading}
          error={popular.error} onRetry={popular.retry} loadingLabel="인기 책 목록을 불러오고 있어요"
        />
      </View>

      {/* ── 개인 추천 ── */}
      {isAuthenticated && (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {recommendations.type === 'personalized'
                ? '나와 같은 취향의 사람들이 읽은 책'
                : `${user?.nickname}님을 위한 인기 도서`}
            </Text>
            <AppButton title="추천 기준" variant="ghost" compact onPress={() => setModalVisible(true)} />
          </View>
          <View style={styles.sectionDivider} />
          <BookCarousel
            title=""
            books={recommendations.books}
            loading={recommendations.loading}
            error={recommendations.error} onRetry={recommendations.retry} loadingLabel="추천 책 목록을 불러오고 있어요"
            emptyMessage="독서 활동을 시작하면 추천이 생성돼요."
          />
        </View>
      )}

      <AppButton title="의견 보내기" compact variant="ghost" onPress={() => router.push('/feedback')} />

      {/* ── Modal ── */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>사용자 기반 추천이란?</Text>
            <Text style={styles.modalText}>
              비슷한 독서 취향을 가진 사용자들이 읽은 책을 보여드립니다.
            </Text>
            <AppButton title="닫기" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>

    </ScrollView>
    </TabScreen>
  );
}
