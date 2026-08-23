import { createNavigationContainerRef } from '@react-navigation/native';

/** Rotas do stack raiz. Sem parâmetros por enquanto — tudo vem das stores. */
export type RootParamList = {
  Connect: undefined;
  Main: undefined;
  Hrv: undefined;
  Sleep: undefined;
  Oxygen: undefined;
  Temperature: undefined;
  Pressure: undefined;
  Stress: undefined;
  Activity: undefined;
  BioAge: undefined;
  Device: undefined;
  WeeklyReport: undefined;
};

/**
 * A sidebar é um overlay fora da árvore de navegação, então não tem acesso aos
 * hooks de navegação. Ela navega por esta ref.
 */
export const navigationRef = createNavigationContainerRef<RootParamList>();

export function navigate(route: keyof RootParamList | string) {
  if (navigationRef.isReady()) navigationRef.navigate(route as keyof RootParamList);
}
