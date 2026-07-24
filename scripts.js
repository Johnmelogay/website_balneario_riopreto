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

// --- LEAD CAPTURE ---
export async function captureLead({ name, email, intention, details = {} }) {
  try {
    const { error } = await supabase
      .from('leads')
      .insert([
        {
          name,
          email,
          intention,
          details,
          created_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error('Supabase Error (Lead Capture):', error);
      // Optional: Fallback mechanisms or silent fail (don't block user flow)
    } else {
      console.log('Lead captured successfully');
      // GA4 Event Tracking
      trackEvent('generate_lead', {
        event_category: 'lead',
        event_label: intention,
        value: details.total || 0, // Track value if available (e.g., reservation total)
        currency: 'BRL'
      });
    }
  } catch (err) {
    console.error('Unexpected error capturing lead:', err);
  }
}

// --- STOCK SNAPSHOT ---
export async function createStockSnapshot(triggeredBy, context = {}) {
  try {
    const { data: products } = await supabase.from('products').select('id, name, stock_qty, is_stock_controlled').eq('is_stock_controlled', true);
    if (!products || products.length === 0) return;
    
    // Store array of {id, qty} to save space
    const snapshotData = products.map(p => ({
      id: p.id,
      qty: p.stock_qty || 0
    }));

    await supabase.from('audit_logs').insert([{
      action_type: 'STOCK_SNAPSHOT',
      details: {
        trigger: triggeredBy,
        snapshot: snapshotData
      },
      ...context
    }]);
    console.log('Stock snapshot saved:', snapshotData.length, 'items');
  } catch(e) {
    console.error('Error creating stock snapshot:', e);
  }
}
