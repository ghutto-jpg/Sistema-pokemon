export function formatWhatsapp(numero, mensagem) {
  const num = (numero || '').replace(/[^0-9+]/g, '');
  const text = encodeURIComponent(mensagem || '');
  return `https://wa.me/${num}?text=${text}`;
}
