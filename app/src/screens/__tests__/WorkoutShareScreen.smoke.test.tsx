/**
 * Fumaça: a tela de compartilhar MONTA com métricas genéricas.
 *
 * Um crash em produção (ago/2026, "tela de compartilhar minha saúde tá
 * crashando") era um erro de JS não tratado ao abrir a tela com `metricas`.
 * Em release o Hermes aborta o app; aqui o erro aparece com nome.
 */
import React from 'react';
import { create, act } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), push: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({
    params: {
      titulo: 'Minha saúde hoje',
      metricas: [
        { valor: '82', rotulo: 'sono' },
        { valor: '31', rotulo: 'idade biológica' },
        { valor: '48 ms', rotulo: 'HRV' },
      ],
    },
  }),
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file://x.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const chain = () => new Proxy({}, { get: () => chain });
  return {
    Gesture: { Pan: chain, Pinch: chain, Rotation: chain, Simultaneous: chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  };
});
jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => ({ colors: { accent: '#877BF0', text: '#fff', textMuted: '#aaa', ink: '#000', scrim: '#0008', hairlineStrong: '#333' }, scheme: 'dark' }),
}));
jest.mock('@tamagui/core', () => {
  const React = require('react');
  const { Text: RNText, View } = require('react-native');
  const passthrough = (C: any) => (props: any) => React.createElement(C, props, props.children);
  return { Text: passthrough(RNText), View: passthrough(View), styled: (C: any) => passthrough(C), useTheme: () => ({}) };
});
jest.mock('@tamagui/stacks', () => {
  const React = require('react');
  const { View } = require('react-native');
  const P = (props: any) => React.createElement(View, props, props.children);
  return { XStack: P, YStack: P, Stack: P };
});
jest.mock('@tamagui/linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props: any) => React.createElement(View, props, props.children) };
});

jest.mock('../../components/Icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Icon: (props: any) => React.createElement(View, { testID: `icon-${props.name}` }) };
});
jest.mock('../../components/Logo', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LogoType: (props: any) => React.createElement(View, props), Logo: (props: any) => React.createElement(View, props) };
});
jest.mock('../../components/DetailScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    DetailScreen: (props: any) => React.createElement(View, null, props.children),
    usePullRefresh: () => undefined,
  };
});
jest.mock('../../components/ui', () => {
  const React = require('react');
  const { Text: RNText, View, Pressable } = require('react-native');
  const T = (props: any) => React.createElement(RNText, props, props.children);
  const V = (props: any) => React.createElement(View, props, props.children);
  return {
    Body: T, BodyLarge: T, Data: T, Display: T, Heading: T, Headline: T, Label: T, Metric: T, MetricSm: T, Micro: T, RatingText: T, SectionTitle: T, Subtitle: T, Title: T,
    Button: (props: any) => React.createElement(Pressable, { onPress: props.onPress }, React.createElement(RNText, null, props.title)),
    Card: V, HeroCard: V, Pill: V, PillText: T, Readout: V, ReadoutCluster: V,
    ShadowView: V, Skeleton: V, PillButton: V, IconButton: V,
    useCardShadow: () => ({}), useCtaShadow: () => ({}), useFabShadow: () => ({}), useHighlightShadow: () => ({}), useSurfaceColor: () => '#000',
  };
});
jest.mock('lucide-react-native', () => ({}));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const V = (props: any) => React.createElement(View, props, props.children);
  return { __esModule: true, default: V, Svg: V, Path: V, Circle: V, Defs: V, RadialGradient: V, Stop: V, Rect: V, G: V, Line: V };
});

import { WorkoutShareScreen } from '../workout/WorkoutShareScreen';

it('monta com título e métricas genéricas sem lançar', async () => {
  let tree: ReturnType<typeof create> | null = null;
  await act(async () => {
    tree = create(React.createElement(WorkoutShareScreen));
  });
  expect(tree).not.toBeNull();
  const texto = JSON.stringify(tree!.toJSON());
  expect(texto).toContain('Minha saúde hoje');
  expect(texto).toContain('idade biológica');
});
