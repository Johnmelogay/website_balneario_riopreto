// OpenAI Ads Pixel (Balneário Rio Preto) + conversão "Pedido de reserva WhatsApp" (lead_created)
!function(w,d,s,u){if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");
oaiq("init",{pixelId:"DXBj4c1FBQYpPQMNtqoVdk",debug:false});

// Dispara a conversão quando alguém vai pro WhatsApp (links wa.me / api.whatsapp)
window.trackWhatsappLead = function () {
  try { window.oaiq && window.oaiq("measure", "lead_created", { type: "customer_action" }); } catch (e) {}
};
document.addEventListener("click", function (e) {
  var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
  if (!a) return;
  var h = a.getAttribute("href") || "";
  // ignora links de "compartilhar" (sem número de telefone)
  if (/wa\.me\/\d|api\.whatsapp\.com\/send\?phone=/.test(h)) window.trackWhatsappLead();
}, true);
