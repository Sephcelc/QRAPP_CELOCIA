import { StyleSheet, Text as NativeText, type TextProps } from 'react-native';

const fontFamilies: Record<string, string> = {
  normal: 'Inter_400Regular',
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
};

export default function AppText({ style, ...props }: TextProps) {
  const textStyle = StyleSheet.flatten(style);
  const fontFamily = textStyle?.fontFamily
    ?? fontFamilies[String(textStyle?.fontWeight ?? '400')]
    ?? fontFamilies['400'];

  return <NativeText {...props} style={[{ fontFamily }, style]} />;
}