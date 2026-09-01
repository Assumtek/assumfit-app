import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Escolher uma foto e prepará-la para viajar até o modelo.
 *
 * A redução para 1280 px não é economia de rede, é o que faz a coisa
 * funcionar: um iPhone recente produz 24 MP, e o base64 disso estoura o teto
 * do corpo da requisição. Sem isto, "fotografar" passava e a análise morria do
 * outro lado, sem erro que apontasse para o tamanho.
 *
 * Nasceu como bloco solto dentro da tela de refeições e virou módulo quando o
 * chat do personal passou a aceitar foto também (Leonardo, 31/08/2026): a
 * terceira cópia do mesmo cuidado é onde uma delas começa a divergir.
 */

export type FotoPronta = { uri: string; base64: string };

/** O que deu errado, em linguagem de tela: quem chama decide onde mostrar. */
export type FalhaDaFoto = 'sem-permissao' | 'camera-indisponivel' | 'preparo';

export async function escolherFoto(
  deCamera: boolean): Promise<{ foto: FotoPronta } | { falha: FalhaDaFoto } | null> {
  /*
   O simulador não tem câmera, e pedir permissão lá devolve negado sempre. A
   permissão de GALERIA não é pedida: o seletor do iOS moderno já roda fora do
   app e devolve só o que a pessoa escolheu.
  */
  if (deCamera && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { falha: 'sem-permissao' };
  }

  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  };

  let escolhida: ImagePicker.ImagePickerAsset | undefined;
  try {
    const resultado = deCamera
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes);
    escolhida = resultado.assets?.[0];
  } catch {
    return { falha: 'camera-indisponivel' };
  }
  // Cancelar não é falha: a pessoa mudou de ideia, e a tela não deve avisar nada.
  if (!escolhida?.uri) return null;

  try {
    const contexto = ImageManipulator.manipulate(escolhida.uri);
    if ((escolhida.width ?? 0) > 1280) contexto.resize({ width: 1280 });
    const renderizada = await contexto.renderAsync();
    const pronta = await renderizada.saveAsync({
      compress: 0.6,
      format: SaveFormat.JPEG,
      base64: true,
    });
    if (!pronta.base64) return { falha: 'preparo' };
    return { foto: { uri: pronta.uri, base64: pronta.base64 } };
  } catch {
    return { falha: 'preparo' };
  }
}

/**
 * Guarda a foto do chat no aparelho e devolve o NOME do arquivo.
 *
 * A política de fotos do app é a mesma desde a refeição e a evolução: a imagem
 * fica com quem ela mostra. O que viaja ao servidor é o nome, que volta no
 * histórico e devolve a foto à bolha certa quando a conversa é reaberta.
 *
 * O nome carrega o instante para não colidir entre duas fotos do mesmo
 * segundo; o formato é o que a rota valida, e mudar um sem o outro faz a foto
 * ser recusada.
 */
export function guardarFotoDoChat(uri: string): string | null {
  const nome = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  try {
    new File(uri).copy(new File(Paths.document, nome));
    return nome;
  } catch {
    // Sem espaço, permissão negada, arquivo sumido: a conversa acontece do
    // mesmo jeito, só não guarda a imagem. Perder a foto não pode custar a
    // resposta que a pessoa foi buscar.
    return null;
  }
}

/** O caminho local de uma foto do chat, ou `null` se ela não está neste aparelho. */
export function caminhoDaFotoDoChat(nome: string): string | null {
  try {
    const f = new File(Paths.document, nome);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}
