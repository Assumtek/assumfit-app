import { Router } from 'express';
import { z } from 'zod';

import { asyncRoute } from '../middleware/error';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import * as auth from '../services/auth.service';

export const authRoutes = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Senha precisa de pelo menos 10 caracteres'),
  name: z.string().min(2),
  birthDate: z.string().date(),
  sex: z.enum(['f', 'm']),
  consentVersion: z.string().min(1),
});

authRoutes.post(
  '/register',
  asyncRoute(async (req, res) => {
    const body = registerSchema.parse(req.body);
    res.status(201).json(await auth.register(body));
  }),
);

authRoutes.post(
  '/login',
  asyncRoute(async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    res.json(await auth.login(body.email, body.password));
  }),
);

authRoutes.post(
  '/refresh',
  asyncRoute(async (req, res) => {
    const body = z.object({ refreshToken: z.string() }).parse(req.body);
    res.json(await auth.refresh(body.refreshToken));
  }),
);

authRoutes.post(
  '/logout',
  asyncRoute(async (req, res) => {
    const body = z.object({ refreshToken: z.string() }).parse(req.body);
    await auth.logout(body.refreshToken);
    res.status(204).end();
  }),
);

/**
 * Perfil da pessoa logada.
 *
 * Devolve consentimentos e assinatura junto, num payload só. São três consultas
 * que a tela de perfil sempre faz ao mesmo tempo, e o custo de três idas à rede
 * numa conexão móvel aparece — o de três queries no mesmo banco, não.
 *
 * `passwordHash` NUNCA sai daqui: a seleção é explícita, campo a campo, em vez
 * de omitir o que não pode vazar. Lista de permissão erra para o lado seguro
 * quando alguém acrescentar uma coluna nova ao modelo.
 */
authRoutes.get(
  '/me',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    res.json(await auth.profile(req.userId));
  }),
);

const updateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  birthDate: z.string().date().optional(),
  sex: z.enum(['f', 'm']).optional(),
});

/**
 * Edição de perfil.
 *
 * E-mail e senha ficam de fora de propósito: os dois são credencial, e trocar
 * credencial exige confirmação da senha atual — fluxo próprio, não um PATCH de
 * cadastro. Data de nascimento e sexo entram porque alimentam as faixas de
 * referência da idade biológica, e um erro de digitação no cadastro precisa ser
 * corrigível sem apagar a conta.
 */
authRoutes.patch(
  '/me',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const body = updateSchema.parse(req.body);
    res.json(await auth.updateProfile(req.userId, body));
  }),
);

/**
 * Direito de acesso e portabilidade (LGPD Art. 18, II e V).
 *
 * A janela é obrigatória e limitada a 366 dias. Prometer "exporte tudo" com 24
 * meses de amostra a cada cinco minutos significa montar milhões de linhas em
 * memória e derrubar o processo — quem quer o histórico inteiro baixa ano a ano.
 */
const MAX_EXPORT_DAYS = 366;

authRoutes.get(
  '/me/export',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(MAX_EXPORT_DAYS).default(90) })
      .parse(req.query);

    const until = new Date();
    const since = new Date(until.getTime() - days * 86_400_000);
    const data = await auth.exportData(req.userId, since, until);

    // `attachment` para o navegador salvar em vez de renderizar — o arquivo é
    // dado pessoal sensível e não deveria aparecer numa aba aberta.
    const stamp = until.toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="assumfit-${stamp}.json"`);
    res.json(data);
  }),
);

/** Direito de eliminação (LGPD Art. 18). Apaga de verdade. */
authRoutes.delete(
  '/me',
  requireAuth,
  asyncRoute<AuthedRequest>(async (req, res) => {
    await auth.deleteAccount(req.userId);
    res.status(204).end();
  }),
);
