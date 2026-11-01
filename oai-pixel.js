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

// ---------------------------------------------------------------------------
// Google Ads (AW-17816218661) + conversão "Clique no WhatsApp (reserva)"
// Reaproveita o window.trackWhatsappLead acima, que já dispara em todo clique
// de WhatsApp (links wa.me e openWhatsApp do scripts.js).
(function () {
  var AW_ID = "AW-17816218661";
  var WHATSAPP_CONVERSION = AW_ID + "/l9HOCKHt7q8dEKXYt69C";

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("config", AW_ID);

  // Só carrega a biblioteca gtag.js se a página não tiver a do Analytics (ex.: reservas.html).
  // Espera o HTML terminar de carregar, porque em várias páginas a tag do Analytics vem depois.
  function ensureGtagLoaded() {
    if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) return;
    window.gtag("js", new Date());
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + AW_ID;
    document.head.appendChild(s);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureGtagLoaded);
  } else {
    ensureGtagLoaded();
  }

  var lastSent = 0;
  function sendWhatsappConversion() {
    var now = Date.now();
    if (now - lastSent < 2000) return; // evita contar duas vezes o mesmo clique
    lastSent = now;
    try { window.gtag("event", "conversion", { send_to: WHATSAPP_CONVERSION }); } catch (e) {}
  }

  var previous = window.trackWhatsappLead;
  window.trackWhatsappLead = function () {
    sendWhatsappConversion();
    if (typeof previous === "function") return previous.apply(this, arguments);
  };
})();
