-- A série que a tendência precisa, e a que ninguém deveria guardar para sempre.
--
-- Duas correções na mesma migração, porque as duas são sobre a mesma coisa:
-- por quanto tempo, e a partir de quando, cada dado existe.

-- 1. O agregado horário não tinha retenção.
--
-- O bruto morre aos 24 meses (política acima, de julho), e `biometric_hourly`
-- sobrevivia indefinidamente. Só que ele também é dado biométrico pessoal,
-- identificado por `user_id`: é a média do batimento de uma pessoa, hora a
-- hora, guardada para sempre. A omissão contradizia o comentário da própria
-- migração que a criou ("passivo jurídico, não patrimônio").
--
-- 25 meses, um mês além do bruto: assim o agregado nunca some antes do dado
-- que o originou, e a janela de tendência (112 dias) continua inteira.
SELECT add_retention_policy('biometric_hourly', INTERVAL '25 months', if_not_exists => TRUE);

-- 2. A janela de reprocessamento era menor que a de recuperação.
--
-- O app varre a memória da pulseira até SEIS dias atrás e envia o que achou
-- (`recoverBandMemory`). A política de refresh só reprocessava três dias, então
-- leitura recuperada dos dias -4, -5 e -6 entrava na hypertable e NUNCA era
-- materializada no agregado. O efeito era duas telas discordando sobre o mesmo
-- dia: o resumo diário (que lê o bruto) mostrava, a série por hora (que lê o
-- agregado) mostrava buraco.
--
-- Oito dias cobre a varredura de sete com uma folga de fuso.
SELECT remove_continuous_aggregate_policy('biometric_hourly', if_not_exists => TRUE);
SELECT add_continuous_aggregate_policy(
  'biometric_hourly',
  start_offset => INTERVAL '8 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);
