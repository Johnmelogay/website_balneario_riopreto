// OpenAI Ads Pixel (Balneário Rio Preto) + conversão "Pedido de reserva WhatsApp" (lead_created)
!function(w,d,s,u){if(w.oaiq)return;var q=function(){q.q.push(arguments)};q.q=[];w.oaiq=q;var j=d.createElement(s);j.async=1;j.src=u;var f=d.getElementsByTagName(s)[0];f.parentNode.insertBefore(j,f)}(window,document,"script","https://bzrcdn.openai.com/sdk/oaiq.min.js");
oaiq("init",{pixelId:"DXBj4c1FBQYpPQMNtqoVdk",debug:false});

// Eventos de navegação reais: page_viewed em toda página e contents_viewed nas páginas de oferta.
// Melhora o aviso "Poucos tipos de evento observados" no OpenAI Ads Manager.
(function () {
  var path = location.pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/";
  var pageId = path === "/" ? "home" : path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-");
  var offers = {
    "/reservas": "Chalés",
    "/detalhes": "Detalhes do chalé",
    "/day-use": "Day Use",
    "/camping": "Camping",
    "/eventos": "Eventos"
  };
  try {
    oaiq("measure", "page_viewed", {
      type: "contents",
      contents: [{ id: pageId, name: document.title || pageId, content_type: "page" }]
    });
    if (offers[path]) {
      oaiq("measure", "contents_viewed", {
        type: "contents",
        contents: [{ id: pageId, name: offers[path], content_type: "product" }]
      });
    }
  } catch (e) {}
})();

// Dados de correspondência: nome e e-mail que o cliente digita nos formulários do site,
// sempre com hash SHA-256 no navegador. Nada é enviado em texto puro.
(function () {
  var sent = "";
  function sha256Hex(v) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    });
  }
  function cleanName(v) {
    return v.toLowerCase().replace(/[\s!-\/:-@\[-`{-~]/g, "");
  }
  window.oaiSetUser = function (nome, email) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve();
    email = (email || "").trim().toLowerCase();
    var parts = (nome || "").trim().split(/\s+/).filter(Boolean);
    var first = parts.length ? cleanName(parts[0]) : "";
    var last = parts.length > 1 ? cleanName(parts[parts.length - 1]) : "";
    var key = [email, first, last].join("|");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || key === sent) return Promise.resolve();
    sent = key;
    return Promise.all([sha256Hex(email), first && sha256Hex(first), last && sha256Hex(last)]).then(function (h) {
      var user = { email_sha256: h[0], country: "BR" };
      if (h[1]) user.first_name_sha256 = h[1];
      if (h[2]) user.last_name_sha256 = h[2];
      oaiq("init", { pixelId: "DXBj4c1FBQYpPQMNtqoVdk", user: user });
    }).catch(function () {});
  };
  var forms = [["nome-reserva", "email-reserva"], ["name", "email"], ["storeName", "storeEmail"]];
  document.addEventListener("change", function (e) {
    var id = e.target && e.target.id;
    forms.forEach(function (f) {
      if (id !== f[0] && id !== f[1]) return;
      var n = document.getElementById(f[0]), m = document.getElementById(f[1]);
      if (n && m) window.oaiSetUser(n.value, m.value);
    });
  }, true);
})();

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

// Conversão "Como chegar (Maps/Waze)": mede quem abre a rota pro balneário.
// Serve pra medir o público de Day Use, que não precisa reservar pelo WhatsApp.
(function () {
  var last = 0;
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var h = a.getAttribute("href") || "";
    if (!/google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps|waze\.com/i.test(h)) return;
    var now = Date.now();
    if (now - last < 2000) return;
    last = now;
    try {
      window.oaiq && window.oaiq("measure", "custom", { type: "custom" }, { custom_event_name: "directions_clicked" });
    } catch (err) {}
  }, true);
})();

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
// ---------------------------------------------------------------------------
// Microsoft Clarity: mapas de calor e gravações de sessão (celular e computador).
// Este arquivo só é carregado nas páginas públicas, não nas telas internas da equipe.
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "z8r2gwnhya");
