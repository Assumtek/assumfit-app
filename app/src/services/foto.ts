import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { presignImagem, type EscopoDeImagem } from './api.service';

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
 * Sobe a imagem para o S3 e devolve a CHAVE dela.
 *
 * Decisão da fundadora (01/09/2026): "todas as imagens precisam ser salvas na
 * S3". Antes cada foto ficava no aparelho, e trocar de celular as perdia.
 *
 * O arquivo vai DIRETO para o S3 por URL pré-assinada, sem passar pelo nosso
 * servidor: é o mesmo desenho do ditado por voz, e evita dobrar o tráfego de
 * uma imagem para nada. Quem decide onde ela pode ser gravada é o servidor,
 * que assina a URL; o aparelho só executa.
 *
 * `null` quando não deu: sem rede, sem credencial no ambiente, S3 fora. Quem
 * chama decide o que fazer, e no chat a conversa acontece do mesmo jeito.
 */
export async function subirImagem(
  uri: string,
  escopo: EscopoDeImagem): Promise<string | null> {
  try {
    const { uploadUrl, key, contentType } = await presignImagem(escopo, 'jpg');
    /*
     `fetch` com o arquivo como corpo: o `expo-file-system` lê o conteúdo e o
     RN envia sem carregar tudo em memória como string. `Content-Type` precisa
     bater com o que foi assinado, senão o S3 recusa com 403 e a mensagem não
     diz por quê.
    */
    const resposta = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    });
    // O S3 responde 200 sem corpo no PUT bem-sucedido.
    return resposta.status >= 200 && resposta.status < 300 ? key : null;
  } catch {
    return null;
  }
}
