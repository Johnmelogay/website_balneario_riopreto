import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

// --- CONSTANTS ---
export const CONSTANTS = {
  WHATSAPP_NUMBER: "5569993129559",
  GA_ID: "G-X77VW91S4X",
  CONTACT_EMAIL: "johnmelocontato@gmail.com"
};

// --- SUPABASE CLIENT ---
const SUPABASE_URL = 'https://hihaipaslnpaqnqotrwm.supabase.co';
// NOTE: User requested not to change security settings yets.
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaGFpcGFzbG5wYXFucW90cndtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyNjE1OTIsImV4cCI6MjA3OTgzNzU5Mn0.zwPHKlcYNQnlQbQdf83qbH3mk4Dsc8fVF4NfWDBs_LA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- UTILS ---

// Formata moeda
export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Google Analytics Tracker
export function trackEvent(eventName, params = {}) {
  if (window.gtag) window.gtag('event', eventName, params);
}

// WhatsApp Redirector
export function openWhatsApp({ text, phone = CONSTANTS.WHATSAPP_NUMBER }) {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// Init Google Analytics (if not already handled by GTM/Script tag logic)
export function initAnalytics() {
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', CONSTANTS.GA_ID);
  window.gtag = gtag;
}
