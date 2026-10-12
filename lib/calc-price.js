export function calcPrice(descontoCliente, precoCaixaMaster, caixaMaster) {
  const dc = Number(descontoCliente) || 0;
  const pcm = Number(precoCaixaMaster) || 0;
  const cm = Number(caixaMaster) || 1;
  const precoCaixaDesc = pcm * (1 - dc / 100);
  const precoUnit = cm <= 0 ? precoCaixaDesc : precoCaixaDesc / cm;
  return { precoCaixaDesc, precoUnit };
}
