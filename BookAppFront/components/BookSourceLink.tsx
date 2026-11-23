import { ExternalLink } from '@/components/ExternalLink';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Typography } from '@/src/styles/designTokens';

export default function BookSourceLink({ source }: { source: { label: string; href: `https://${string}` } }) {
  const colors = Colors[useColorScheme() ?? 'dark'];
  return (
    <ExternalLink href={source.href} style={[Typography.caption, { color: colors.inkSoft, textDecorationLine: 'underline' }]}>
      출처 · {source.label}
    </ExternalLink>
  );
}
